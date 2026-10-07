import { describe, it, expect } from "vitest";
import { parseNordPoolPayload } from "@/lib/agileForecastApi";
import { buildEstimate, chooseSlots, generateDaySlots, type PricedSlot } from "@/lib/agileForecast";

// Sample GB half-hour auction (UK, GBP/MWh, GMT) for 2026-01-15; unlisted slots filled with 150.
const known: Record<string, number> = {
  "00:00": 158.21, "06:30": 219.48, "12:30": 135.07, "13:30": 132.07,
  "17:30": 200.41, "18:30": 201.21, "22:00": 133.03, "22:30": 133.41,
};
const payload = (date: string) => ({
  multiAreaEntries: Array.from({ length: 48 }, (_, i) => {
    const hh = String(Math.floor(i / 2)).padStart(2, "0");
    const mm = i % 2 ? "30" : "00";
    const t0 = new Date(`${date}T${hh}:${mm}:00Z`);
    return {
      deliveryStart: t0.toISOString(),
      deliveryEnd: new Date(t0.getTime() + 1800000).toISOString(),
      entryPerArea: { UK: known[`${hh}:${mm}`] ?? 150 },
    };
  }),
});

describe("Nord Pool parsing", () => {
  it("parses the sample into exactly 48 priced slots and converts GBP/MWh to p/kWh", () => {
    const points = parseNordPoolPayload(payload("2026-01-15"));
    expect(points).toHaveLength(48);
    const slots = buildEstimate("2026-01-15", points);
    expect(slots).toHaveLength(48);
    expect(slots.every((s) => s.price !== null)).toBe(true);
    expect(slots[13].label).toBe("06:30");
    // 219.48 GBP/MWh = 21.948p/kWh wholesale -> *2.2 *1.05
    expect(slots[13].price).toBeCloseTo(21.948 * 2.2 * 1.05, 5);
    // 16:00-19:00 UK peak adder
    expect(slots[35].label).toBe("17:30");
    expect(slots[35].price).toBeCloseTo((20.041 * 2.2 + 12) * 1.05, 5);
  });

  it("maps GMT delivery periods onto Europe/London in BST", () => {
    const points = parseNordPoolPayload(payload("2026-07-15"));
    const slots = buildEstimate("2026-07-15", points);
    expect(slots).toHaveLength(48);
    // 2026-07-15 BST: UK 00:00 = 23:00Z previous day, so the final 23:00Z-24:00Z of the sample is absent
    expect(slots.filter((s) => s.price !== null).length).toBe(46);
  });

  it("handles 46/50 slot clock-change days and ignores malformed payloads", () => {
    expect(generateDaySlots("2026-03-29")).toHaveLength(46);
    expect(generateDaySlots("2026-10-25")).toHaveLength(50);
    expect(parseNordPoolPayload("<!doctype html>")).toEqual([]);
    expect(parseNordPoolPayload({ multiAreaEntries: [{ deliveryStart: "x" }] })).toEqual([]);
  });
});

describe("fallback chain", () => {
  const date = "2026-01-15";
  const np = parseNordPoolPayload(payload(date));
  const midPoints = np.map((p) => ({ ...p, pricePerMwh: 100 }));
  const cached: PricedSlot[] = buildEstimate(date, np.map((p) => ({ ...p, pricePerMwh: 50 })));

  it("prefers Nord Pool, then cache, then MID, then empty", () => {
    expect(chooseSlots(date, { nordPool: np, cached, mid: midPoints }).source).toBe("nordpool");
    expect(chooseSlots(date, { nordPool: [], cached, mid: midPoints }).source).toBe("cache");
    const mid = chooseSlots(date, { nordPool: [], cached: null, mid: midPoints });
    expect(mid.source).toBe("mid");
    expect(mid.slots).toHaveLength(48);
    const none = chooseSlots(date, {});
    expect(none.source).toBe("none");
    expect(none.slots).toHaveLength(48);
  });
});

describe("static snapshot generator", () => {
  it("accepts a complete day and rejects partial days", async () => {
    const { isCompleteDayPayload, expectedSlots } = await import("../../scripts/fetch-nordpool.mjs");
    const full = payload("2026-01-15");
    expect(expectedSlots("2026-01-15")).toBe(48);
    expect(expectedSlots("2026-03-29")).toBe(46);
    expect(expectedSlots("2026-10-25")).toBe(50);
    expect(isCompleteDayPayload("2026-01-15", full)).toBe(true);
    expect(isCompleteDayPayload("2026-01-15", { multiAreaEntries: full.multiAreaEntries.slice(0, 25) })).toBe(false);
    expect(isCompleteDayPayload("2026-01-15", "<html>")).toBe(false);
  });

  it("rejects partial data and HTML in the chooser", () => {
    const partial = parseNordPoolPayload({ multiAreaEntries: payload("2026-01-15").multiAreaEntries.slice(0, 25) });
    const r = chooseSlots("2026-01-15", { nordPool: partial });
    expect(r.source).toBe("none");
    expect(r.partial).toBe(true);
  });
});
