import { describe, it, expect } from "vitest";
import {
  mwhToPencePerKwh, estimateAgilePrice, isPeak, generateDaySlots, buildEstimate,
  cheapestWindow, cheapestSlot, REGION_MULTIPLIERS, PEAK_ADDER_P, VAT_MULTIPLIER, loadCachedSlots, saveCachedSlots,
} from "@/lib/agileForecast";

describe("agileForecast", () => {
  it("converts £/MWh to p/kWh", () => expect(mwhToPencePerKwh(100)).toBe(10));

  it("applies off-peak multiplier, adjustment and VAT", () => {
    const t = new Date("2026-01-15T12:00:00Z");
    expect(estimateAgilePrice(100, t)).toBeCloseTo(10 * REGION_MULTIPLIERS.F * VAT_MULTIPLIER);
  });

  it("applies peak multiplier 16:00-19:00 UK (BST aware)", () => {
    expect(isPeak(new Date("2026-07-15T15:00:00Z"))).toBe(true); // 16:00 BST
    expect(isPeak(new Date("2026-07-15T18:00:00Z"))).toBe(false); // 19:00 BST
    expect(isPeak(new Date("2026-01-15T16:00:00Z"))).toBe(true);
    expect(estimateAgilePrice(100, new Date("2026-01-15T16:00:00Z"))).toBeCloseTo((10 * REGION_MULTIPLIERS.F + PEAK_ADDER_P) * VAT_MULTIPLIER);
  });

  it("matches known wholesale -> Agile pairs (no -3.5p deduction)", () => {
    expect(estimateAgilePrice(135.1, new Date("2026-01-15T12:00:00Z"))).toBeCloseTo(31.21, 1); // 13.51*2.2*1.05
    expect(estimateAgilePrice(135.1, new Date("2026-07-15T15:30:00Z"))).toBeCloseTo(43.81, 1); // 16:30 BST peak
    expect(estimateAgilePrice(135.1, new Date("2026-07-15T18:30:00Z"))).toBeCloseTo(31.21, 1); // 19:30 BST off-peak
  });

  it("round-trips the slot cache and rejects expired entries", () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
    const slots = buildEstimate("2026-01-15", []);
    saveCachedSlots("2026-01-15", slots, "F", 1000);
    expect(loadCachedSlots("2026-01-15", "F", 2000)).toHaveLength(48);
    expect(loadCachedSlots("2026-01-15", "F", 1000 + 7 * 3600 * 1000)).toBeNull();
    delete (globalThis as any).localStorage;
  });

  it("caps high prices and allows negatives", () => {
    expect(estimateAgilePrice(100000, new Date("2026-01-15T17:00:00Z"))).toBe(100);
    expect(estimateAgilePrice(-50, new Date("2026-01-15T12:00:00Z"))).toBeLessThan(0);
  });

  it("generates 48 slots, and 46/50 on clock changes", () => {
    const s = generateDaySlots("2026-01-15");
    expect(s).toHaveLength(48);
    expect(s[0].label).toBe("00:00");
    expect(s[47].label).toBe("23:30");
    expect(generateDaySlots("2026-03-29")).toHaveLength(46);
    expect(generateDaySlots("2026-10-25")).toHaveLength(50);
  });

  it("handles missing data and finds cheapest slot/window", () => {
    const slots = generateDaySlots("2026-01-15");
    const wholesale = slots.slice(0, 10).map((s, i) => ({ start: s.start, pricePerMwh: i === 4 ? -20 : 50 }));
    const est = buildEstimate("2026-01-15", wholesale);
    expect(est[10].price).toBeNull();
    expect(est[4].isNegative).toBe(true);
    expect(cheapestSlot(est)?.label).toBe("02:00");
    expect(cheapestWindow(est, 3)?.startIndex).toBeGreaterThanOrEqual(2);
    expect(cheapestWindow([], 3)).toBeNull();
  });
});
