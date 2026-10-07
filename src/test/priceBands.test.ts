import { describe, it, expect, beforeEach } from "vitest";
import { priceBand } from "@/lib/priceBands";
import {
  buildEstimate, chooseSlots, generateDaySlots, isCompleteDay, loadCachedSlots, saveCachedSlots, cacheKey, purgeLegacyCaches,
} from "@/lib/agileForecast";

describe("priceBand boundaries", () => {
  it.each([
    [-0.01, "negative"], [0, "green"], [14.99, "green"], [15, "amber"], [24.99, "amber"],
    [25, "orange"], [30, "orange"], [30.01, "red"],
  ])("%s -> %s", (p, id) => expect(priceBand(p).id).toBe(id));
});

describe("partial caches", () => {
  const date = "2026-01-15";
  const full = generateDaySlots(date).map((s) => ({ ...s, price: 10, isNegative: false }));
  const partial = full.map((s, i) => (i > 25 ? { ...s, price: null } : s));
  beforeEach(() => localStorage.clear());

  it("rejects truncated data and never saves it", () => {
    expect(isCompleteDay(date, full)).toBe(true);
    expect(isCompleteDay(date, partial)).toBe(false);
    expect(isCompleteDay(date, full.slice(0, 26))).toBe(false);
    saveCachedSlots(date, partial);
    expect(loadCachedSlots(date)).toBeNull();
    saveCachedSlots(date, full);
    expect(loadCachedSlots(date)).toHaveLength(48);
  });

  it("ignores a partial entry already in storage and purges old versions", () => {
    localStorage.setItem(cacheKey(date), JSON.stringify({ savedAt: Date.now(), slots: partial }));
    expect(loadCachedSlots(date)).toBeNull();
    localStorage.setItem("acb-slots-v1:2026-01-15:F", "x");
    purgeLegacyCaches();
    expect(localStorage.getItem("acb-slots-v1:2026-01-15:F")).toBeNull();
  });

  it("chooseSlots flags partial data instead of rendering it", () => {
    const pts = full.slice(0, 26).map((s) => ({ start: s.start, pricePerMwh: 100 }));
    const r = chooseSlots(date, { nordPool: pts, cached: partial });
    expect(r.source).toBe("none");
    expect(r.partial).toBe(true);
    expect(chooseSlots(date, { nordPool: pts, cached: full }).source).toBe("cache");
    expect(buildEstimate(date, pts).filter((s) => s.price !== null)).toHaveLength(26);
  });
});
