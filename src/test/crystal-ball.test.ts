import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGILE_FORMULA, addDays, agilePriceFromWholesale, buildNotificationMessage, cheapestWindow,
  compareEstimateToOfficial, isWithinNotificationWindow, notificationKey, notificationTargetDate,
  percentChange, shouldSendNotification, ukDate, ukMidnightUtc, type PriceSlot,
} from "@/lib/crystal-ball-utils";

const cfg = { ...DEFAULT_AGILE_FORMULA, multiplier: 2, peakAdder: 10, vatFactor: 1, cap: 100, floor: -20 };

describe("Agile formula", () => {
  it("applies the multiplier off-peak", () => {
    expect(agilePriceFromWholesale(5, new Date("2026-01-15T10:00:00Z"), cfg)).toBe(10);
  });
  it("adds the peak adder 16:00-19:00 UK (winter)", () => {
    expect(agilePriceFromWholesale(5, new Date("2026-01-15T16:00:00Z"), cfg)).toBe(20);
    expect(agilePriceFromWholesale(5, new Date("2026-01-15T19:00:00Z"), cfg)).toBe(10);
  });
  it("uses UK local time for the peak in BST", () => {
    // 15:00Z = 16:00 BST (peak); 16:00Z = 17:00 BST (peak); 18:00Z = 19:00 BST (not)
    expect(agilePriceFromWholesale(5, new Date("2026-07-15T15:00:00Z"), cfg)).toBe(20);
    expect(agilePriceFromWholesale(5, new Date("2026-07-15T18:00:00Z"), cfg)).toBe(10);
    expect(agilePriceFromWholesale(5, new Date("2026-07-15T16:00:00Z"), cfg)).toBe(20);
  });
  it("applies cap and floor", () => {
    expect(agilePriceFromWholesale(80, new Date("2026-01-15T10:00:00Z"), cfg)).toBe(100);
    expect(agilePriceFromWholesale(-30, new Date("2026-01-15T10:00:00Z"), cfg)).toBe(-20);
  });
  it("keeps negative wholesale negative", () => {
    expect(agilePriceFromWholesale(-2, new Date("2026-01-15T10:00:00Z"), cfg)).toBe(-4);
  });
});

describe("percentChange", () => {
  it("handles up, down, zero and missing", () => {
    expect(percentChange(20, 25)).toBeCloseTo(25);
    expect(percentChange(20, 15)).toBeCloseTo(-25);
    expect(percentChange(0, 5)).toBeNull();
    expect(percentChange(null, 5)).toBeNull();
    expect(percentChange(-2, -1)).toBeGreaterThan(0);
  });
});

describe("UK date helpers", () => {
  it("midnight UTC offset follows DST", () => {
    expect(ukMidnightUtc("2026-07-15").toISOString()).toBe("2026-07-14T23:00:00.000Z");
    expect(ukMidnightUtc("2026-01-15").toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
  it("ukDate and addDays", () => {
    expect(ukDate(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-16");
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
  });
});

describe("notification windows & de-dup", () => {
  const at = (iso: string) => new Date(iso);
  it("estimate window is 11:30-13:00 UK incl. BST", () => {
    expect(isWithinNotificationWindow("estimate_ready", at("2026-07-15T10:29:00Z"))).toBe(false); // 11:29 BST
    expect(isWithinNotificationWindow("estimate_ready", at("2026-07-15T10:30:00Z"))).toBe(true); // 11:30 BST
    expect(isWithinNotificationWindow("estimate_ready", at("2026-07-15T09:30:00Z"))).toBe(false); // 10:30 BST, old window
    expect(isWithinNotificationWindow("estimate_ready", at("2026-01-15T11:30:00Z"))).toBe(true); // GMT
    expect(isWithinNotificationWindow("estimate_ready", at("2026-01-15T13:00:00Z"))).toBe(false);
  });
  it("official window starts 16:00 UK", () => {
    expect(isWithinNotificationWindow("official_released", at("2026-07-15T14:59:00Z"))).toBe(false);
    expect(isWithinNotificationWindow("official_released", at("2026-07-15T15:00:00Z"))).toBe(true);
  });
  it("target date is tomorrow in UK time", () => {
    expect(notificationTargetDate(at("2026-07-15T23:30:00Z"))).toBe("2026-07-17");
  });
  it("only sends with data, in window, and once per type/day", () => {
    const now = at("2026-01-15T11:45:00Z");
    const base = { type: "estimate_ready" as const, now, region: "F", alreadySentKeys: [] as string[] };
    expect(shouldSendNotification({ ...base, hasData: false })).toBe(false);
    expect(shouldSendNotification({ ...base, hasData: true })).toBe(true);
    const key = notificationKey("estimate_ready", "F", "2026-01-16");
    expect(shouldSendNotification({ ...base, hasData: true, alreadySentKeys: [key] })).toBe(false);
    expect(shouldSendNotification({ ...base, type: "official_released", hasData: true, alreadySentKeys: [key] })).toBe(false); // out of window
    expect(shouldSendNotification({ ...base, hasData: true, alreadySentKeys: [notificationKey("official_released", "F", "2026-01-16")] })).toBe(true);
    expect(shouldSendNotification({ ...base, hasData: true, now: at("2026-01-15T13:00:00Z") })).toBe(false);
  });
});

describe("messages & comparison", () => {
  const slot = (i: number, v: number): PriceSlot => ({
    valid_from: new Date(Date.UTC(2026, 0, 16, 0, 30 * i)).toISOString(),
    valid_to: new Date(Date.UTC(2026, 0, 16, 0, 30 * (i + 1))).toISOString(),
    value_inc_vat: v,
  });
  it("builds up/down messages with negatives", () => {
    const m = buildNotificationMessage({ type: "estimate_ready", tomorrow: [slot(0, -2), slot(1, 10)], todayAverage: 8 });
    expect(m.body).toContain("down 50%");
    expect(m.body).toContain("1 negative slot");
    expect(m.body).toContain("Estimate only");
    const o = buildNotificationMessage({ type: "official_released", tomorrow: [slot(0, 12), slot(1, 12)], todayAverage: 10 });
    expect(o.body).toContain("up 20%");
    expect(o.body).not.toContain("Estimate only");
  });
  it("finds the cheapest contiguous window", () => {
    const s = [slot(0, 5), slot(1, 1), slot(2, 1), slot(3, 9)];
    expect(cheapestWindow(s, 1)?.start).toBe(s[1].valid_from);
    expect(cheapestWindow(s, 3)).toBeNull();
  });
  it("compares estimate with official", () => {
    const c = compareEstimateToOfficial([slot(0, 10), slot(1, 20)], [slot(0, 12), slot(1, 18)]);
    expect(c.averageDiff).toBe(0);
    expect(c.meanAbsDiff).toBe(2);
    expect(c.slots[0].diff).toBe(2);
  });
});
