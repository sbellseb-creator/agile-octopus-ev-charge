import { describe, expect, it } from "vitest";
import {
  ProviderError, checkDays, deriveCrystalState, diagnosePreviousDays, expectedPublicationTime, fitFormula,
  formatDuration, isWithinNotificationWindow, waitingInfo,
} from "@/lib/crystal-ball-utils";
import { parseElexonMarketIndex, parseNordPoolDayAhead } from "../../supabase/functions/_shared/wholesale-parsers";
import { pushStatusLine } from "@/lib/push-status";

describe("wholesale parsers", () => {
  it("parses Elexon MID, converts GBP/MWh to p/kWh, drops zero-volume placeholders and other providers", () => {
    const json = { data: [
      { startTime: "2026-01-15T00:00:00Z", dataProvider: "APXMIDP", price: 80, volume: 10 },
      { startTime: "2026-01-15T00:00:00Z", dataProvider: "N2EXMIDP", price: 0, volume: 0 },
      { startTime: "2026-01-15T00:30:00Z", dataProvider: "APXMIDP", price: 0, volume: 0 },
      { startTime: "2026-01-15T01:00:00Z", dataProvider: "APXMIDP", price: -20, volume: 5 },
      { startTime: "2026-01-16T00:00:00Z", dataProvider: "APXMIDP", price: 50, volume: 5 },
    ] };
    const out = parseElexonMarketIndex(json, "APXMIDP", "2026-01-15");
    expect(out.map((s) => s.pence_per_kwh)).toEqual([8, -2]);
    expect(out[0].valid_to).toBe("2026-01-15T00:30:00.000Z");
    expect(parseElexonMarketIndex({}, "APXMIDP", "2026-01-15")).toEqual([]);
  });
  it("splits hourly Nord Pool entries into half-hours inside the UK day (BST)", () => {
    const json = { multiAreaEntries: [
      { deliveryStart: "2026-07-14T23:00:00Z", deliveryEnd: "2026-07-15T00:00:00Z", entryPerArea: { UK: 100 } },
      { deliveryStart: "2026-07-14T22:00:00Z", deliveryEnd: "2026-07-14T23:00:00Z", entryPerArea: { UK: 5 } },
    ] };
    const out = parseNordPoolDayAhead(json, "UK", "2026-07-15");
    expect(out).toHaveLength(2);
    expect(out[0].pence_per_kwh).toBe(10);
  });
});

describe("status logic", () => {
  const base = { date: "2026-01-16", now: new Date("2026-01-15T12:40:00Z"), hasOfficial: false, estimateCount: 0, loaded: true };
  it("waiting vs error vs available vs official", () => {
    expect(deriveCrystalState(base)).toBe("waiting");
    expect(deriveCrystalState({ ...base, fetchError: "boom" })).toBe("error");
    expect(deriveCrystalState({ ...base, estimateCount: 48 })).toBe("available");
    expect(deriveCrystalState({ ...base, hasOfficial: true, fetchError: "boom" })).toBe("official");
  });
  it("past days with no rows are no_data, not waiting", () => {
    expect(deriveCrystalState({ ...base, date: "2026-01-14" })).toBe("no_data");
  });
  it("computes how long we've waited past expected publication", () => {
    expect(expectedPublicationTime("2026-01-16").toISOString()).toBe("2026-01-15T11:30:00.000Z");
    expect(expectedPublicationTime("2026-07-16").toISOString()).toBe("2026-07-15T10:30:00.000Z");
    const w = waitingInfo("2026-01-16", new Date("2026-01-15T12:40:00Z"));
    expect(w).toMatchObject({ pastDue: true, minutesPast: 70 });
    expect(formatDuration(70)).toBe("1h 10m");
    expect(waitingInfo("2026-01-16", new Date("2026-01-15T10:00:00Z")).pastDue).toBe(false);
  });
});

describe("previous-days diagnostic", () => {
  const days = ["2026-01-14", "2026-01-13", "2026-01-12"];
  it("reports ok when settled days return data", async () => {
    const checks = await checkDays(async (d) => (d === "2026-01-14" ? [1, 2] : []), days);
    expect(checks.map((c) => c.status)).toEqual(["data", "empty", "empty"]);
    expect(diagnosePreviousDays(checks).verdict).toBe("ok");
  });
  it("flags a wrong dataset/filter when every previous day is empty", async () => {
    const checks = await checkDays(async () => [], days);
    expect(diagnosePreviousDays(checks).verdict).toBe("provider_wrong");
  });
  it("surfaces the failure reason instead of treating it as empty", async () => {
    const checks = await checkDays(async () => { throw new ProviderError("auth_required", "token needed"); }, days);
    const d = diagnosePreviousDays(checks);
    expect(d.verdict).toBe("provider_failing");
    expect(d.message).toContain("token needed");
  });
});

describe("formula fit", () => {
  it("recovers multiplier and peak adder from official rates", () => {
    const samples = Array.from({ length: 40 }, (_, i) => {
      const wholesale = 5 + (i % 7) * 2;
      const peak = i % 4 === 0;
      return { wholesale, peak, official: (wholesale * 2.2 + (peak ? 12 : 0)) * 1.05 };
    });
    const fit = fitFormula(samples, 1.05, 100, -25)!;
    expect(fit.multiplier).toBeCloseTo(2.2, 5);
    expect(fit.peakAdder).toBeCloseTo(12, 5);
    expect(fitFormula(samples.slice(0, 3), 1.05, 100, -25)).toBeNull();
  });
});

describe("notification windows", () => {
  it("estimate window ends 13:00 UK; official starts 16:00", () => {
    expect(isWithinNotificationWindow("estimate_ready", new Date("2026-01-15T12:59:00Z"))).toBe(true);
    expect(isWithinNotificationWindow("estimate_ready", new Date("2026-01-15T13:00:00Z"))).toBe(false);
    expect(isWithinNotificationWindow("official_released", new Date("2026-07-15T15:00:00Z"))).toBe(true);
  });
});

describe("push status line", () => {
  it("summarises configured / subscribed / last test", () => {
    const line = pushStatusLine({ supported: true, configured: true, permission: "granted", subscribed: true, lastTest: { ok: true, at: "t" } }, () => "12:40");
    expect(line).toBe("Push: configured / permission granted / subscribed / last test OK 12:40");
    expect(pushStatusLine({ supported: true, configured: false, permission: "default", subscribed: false, lastTest: null })).toContain("NOT configured");
  });
});
