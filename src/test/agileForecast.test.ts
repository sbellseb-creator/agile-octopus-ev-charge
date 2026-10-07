import { describe, it, expect } from "vitest";
import {
  mwhToPencePerKwh, estimateAgilePrice, isPeak, generateDaySlots, buildEstimate,
  cheapestWindow, cheapestSlot, REGION_MULTIPLIERS, PEAK_ADDER_P, VAT_MULTIPLIER, AGILE_ESTIMATE_CONFIG, loadCachedSlots, saveCachedSlots, loadStaleCachedSlots, loadLatestCachedDay,
} from "@/lib/agileForecast";

describe("agileForecast", () => {
  it("converts £/MWh to p/kWh", () => expect(mwhToPencePerKwh(100)).toBe(10));

  const cfg = AGILE_ESTIMATE_CONFIG;
  const expected = (mwh: number, peak: boolean) =>
    Math.min((mwh / 10) * cfg.regionMultipliers.F + (peak ? cfg.peakAdderP : 0), cfg.capP) * cfg.vat + cfg.offsetP;

  it("applies multiplier, cap, VAT then offset", () => {
    expect(estimateAgilePrice(100, new Date("2026-01-15T12:00:00Z"))).toBeCloseTo(expected(100, false));
    expect(estimateAgilePrice(100000, new Date("2026-01-15T12:00:00Z"))).toBeCloseTo(95 * 1.05 - 3.5);
  });

  it("detects peak 16:00-19:00 Europe/London (BST aware)", () => {
    expect(isPeak(new Date("2026-07-15T15:00:00Z"))).toBe(true); // 16:00 BST
    expect(isPeak(new Date("2026-07-15T18:00:00Z"))).toBe(false); // 19:00 BST
    expect(isPeak(new Date("2026-07-15T14:59:00Z"))).toBe(false); // 15:59 BST
    expect(isPeak(new Date("2026-01-15T16:00:00Z"))).toBe(true);
    expect(isPeak(new Date("2026-01-15T19:00:00Z"))).toBe(false);
  });

  it("estimates real Nord Pool samples (GBP/MWh) for a GMT day", () => {
    const samples: [string, number, boolean][] = [
      ["2026-01-15T00:00:00Z", 158.21, false],
      ["2026-01-15T06:30:00Z", 219.48, false],
      ["2026-01-15T12:30:00Z", 135.07, false],
      ["2026-01-15T13:30:00Z", 132.07, false],
      ["2026-01-15T17:30:00Z", 200.41, true],
      ["2026-01-15T18:30:00Z", 201.21, true],
      ["2026-01-15T22:00:00Z", 133.03, false],
    ];
    for (const [iso, mwh, peak] of samples) {
      const t = new Date(iso);
      expect(isPeak(t)).toBe(peak);
      expect(estimateAgilePrice(mwh, t)).toBeCloseTo(expected(mwh, peak), 6);
    }
    expect(estimateAgilePrice(135.07, new Date("2026-01-15T12:30:00Z"))).toBeCloseTo(27.7, 0);
  });

  it("treats UTC-indexed slots as Europe/London in BST", () => {
    // 17:30Z is 18:30 BST (peak); 18:30Z is 19:30 BST (off-peak)
    expect(estimateAgilePrice(200, new Date("2026-07-15T17:30:00Z"))).toBeCloseTo(expected(200, true));
    expect(estimateAgilePrice(200, new Date("2026-07-15T18:30:00Z"))).toBeCloseTo(expected(200, false));
  });

  it("builds exactly 48 slots and memoizes", () => {
    const day = generateDaySlots("2026-07-15");
    const w = day.map((s, i) => ({ start: s.start, pricePerMwh: 130 + i }));
    const a = buildEstimate("2026-07-15", w);
    expect(a).toHaveLength(48);
    expect(a.every((s) => s.price !== null)).toBe(true);
    expect(buildEstimate("2026-07-15", w)).toBe(a);
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

  it("serves expired cache via the stale loader and finds the latest cached day", () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; },
      get length() { return Object.keys(store).length; }, key: (i: number) => Object.keys(store)[i] ?? null,
    };
    const full = (d: string) => generateDaySlots(d).map((s) => ({ ...s, price: 10, isNegative: false }));
    saveCachedSlots("2026-01-14", full("2026-01-14"), "F", 1000);
    saveCachedSlots("2026-01-15", full("2026-01-15"), "F", 1000);
    expect(loadCachedSlots("2026-01-15", "F", 1000 + 7 * 3600 * 1000)).toBeNull();
    expect(loadStaleCachedSlots("2026-01-15")).toHaveLength(48);
    expect(loadLatestCachedDay()?.dateKey).toBe("2026-01-15");
    expect(loadStaleCachedSlots("2026-01-16")).toBeNull();
    delete (globalThis as any).localStorage;
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

import { isPastPublishTime, dayThresholds, priceBand, type PricedSlot } from "@/lib/agileForecast";

describe("agileForecast refresh and colours", () => {
  it("uses Europe/London for the 11:00 publish check", () => {
    expect(isPastPublishTime(new Date("2026-07-01T09:59:00Z"))).toBe(false); // 10:59 BST
    expect(isPastPublishTime(new Date("2026-07-01T10:00:00Z"))).toBe(true); // 11:00 BST
    expect(isPastPublishTime(new Date("2026-01-01T10:59:00Z"))).toBe(false); // 10:59 GMT
  });

  it("bands prices relative to the day's range", () => {
    const mk = (price: number): PricedSlot => ({ start: "", end: "", label: "", price, isNegative: price <= 0 });
    const slots = [10, 11, 12, 20, 21, 22, 40, 41, 42].map(mk);
    const t = dayThresholds(slots)!;
    expect(priceBand(mk(10), t, false)).toBe("low");
    expect(priceBand(mk(21), t, false)).toBe("mid");
    expect(priceBand(mk(42), t, false)).toBe("high");
    expect(priceBand(mk(10), t, true)).toBe("window");
    expect(priceBand(mk(-1), t, true)).toBe("negative");
  });
});
