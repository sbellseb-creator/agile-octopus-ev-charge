import { describe, it, expect } from "vitest";
import { buildPlan, costBetween, minutesToReachSoc, type ChargeParams, type PlanRate } from "@/lib/charge-plan";

const base: ChargeParams = { batteryKwh: 60, startSoc: 20, endSoc: 80, chargerKw: 6, efficiency: 1 };
const T0 = Date.UTC(2025, 0, 10, 0, 0);

function rates(prices: number[]): PlanRate[] {
  return prices.map((p, i) => ({
    valid_from: new Date(T0 + i * 30 * 60000).toISOString(),
    valid_to: new Date(T0 + (i + 1) * 30 * 60000).toISOString(),
    value_inc_vat: p,
  }));
}

describe("charge-plan", () => {
  it("computes minutes to reach SoC with efficiency", () => {
    expect(minutesToReachSoc(base)).toBeCloseTo(360, 3); // 36kWh at 6kW
    expect(minutesToReachSoc({ ...base, efficiency: 0.9 })).toBeCloseTo(400, 3);
  });

  it("charges from an arbitrary minute and costs per minute", () => {
    const p = { ...base, startSoc: 0, endSoc: 10 }; // 6 kWh = 60 min
    const from = new Date(T0 + 47 * 60000);
    const plan = buildPlan({ strategy: "now", params: p, rates: rates(new Array(6).fill(10)), from });
    expect(plan.totalMinutes).toBeCloseTo(60, 3);
    expect(plan.windows[0].start.getTime()).toBe(from.getTime());
    expect(plan.windows[0].end.getTime()).toBe(from.getTime() + 60 * 60000);
    expect(plan.costGbp).toBeCloseTo(0.6, 4); // 6kWh * 10p
  });

  it("splits cost across a price boundary mid-slot", () => {
    const p = { ...base, startSoc: 0, endSoc: 5 }; // 3kWh = 30min
    const from = new Date(T0 + 15 * 60000);
    const plan = buildPlan({ strategy: "now", params: p, rates: rates([10, 30]), from });
    // 15 min @10p (1.5kWh) + 15 min @30p (1.5kWh)
    expect(plan.costGbp).toBeCloseTo((1.5 * 10 + 1.5 * 30) / 100, 4);
  });

  it("handles negative prices and reports earnings", () => {
    const p = { ...base, startSoc: 0, endSoc: 5 };
    const plan = buildPlan({
      strategy: "deadline",
      params: p,
      rates: rates([20, -10, 20]),
      from: new Date(T0),
      until: new Date(T0 + 90 * 60000),
    });
    expect(plan.windows).toHaveLength(1);
    expect(plan.windows[0].start.getTime()).toBe(T0 + 30 * 60000);
    expect(plan.costGbp).toBeCloseTo(-0.3, 4);
    expect(plan.negativeEarningsGbp).toBeCloseTo(0.3, 4);
    expect(plan.negativeMinutes).toBeCloseTo(30, 3);
  });

  it("extends past the target while negative when allowed", () => {
    const p = { ...base, startSoc: 0, endSoc: 5 };
    const r = rates([20, -10, -10, 20]);
    const off = buildPlan({ strategy: "deadline", params: p, rates: r, from: new Date(T0) });
    const on = buildPlan({ strategy: "deadline", params: p, rates: r, from: new Date(T0), extendIntoNegative: true });
    expect(on.batteryKwh).toBeGreaterThan(off.batteryKwh);
    expect(on.costGbp).toBeLessThan(off.costGbp);
  });

  it("never schedules outside the deadline", () => {
    const until = new Date(T0 + 120 * 60000 + 7 * 60000);
    const plan = buildPlan({
      strategy: "deadline",
      params: base,
      rates: rates([5, 5, 5, 5, 5, 5, 5, 5]),
      from: new Date(T0),
      until,
    });
    expect(plan.end!.getTime()).toBeLessThanOrEqual(until.getTime());
    expect(plan.targetReached).toBe(false);
    expect(plan.shortfallKwh).toBeGreaterThan(0);
  });

  it("threshold strategy only uses minutes at or below the limit", () => {
    const plan = buildPlan({
      strategy: "threshold",
      params: base,
      rates: rates([30, 5, 30, 5]),
      from: new Date(T0),
      thresholdPence: 10,
    });
    expect(plan.windows).toHaveLength(2);
    expect(plan.avgPence).toBeCloseTo(5, 4);
  });

  it("tapering lengthens the charge", () => {
    const p = { ...base, startSoc: 70, endSoc: 100 };
    const flat = minutesToReachSoc(p);
    const taper = minutesToReachSoc({ ...p, taperAboveSoc: 80, taperPowerFactor: 0.5 });
    expect(taper).toBeGreaterThan(flat);
  });

  it("costBetween prices an arbitrary plug-in period", () => {
    const plan = costBetween({ ...base, startSoc: 0 }, rates([10, 10]), new Date(T0 + 10 * 60000), new Date(T0 + 40 * 60000));
    expect(plan.totalMinutes).toBeCloseTo(30, 3);
    expect(plan.costGbp).toBeCloseTo(0.3, 4);
  });
});

describe("charge-plan strategies", () => {
  it("topup picks the cheapest minutes with no deadline", () => {
    const p = { ...base, startSoc: 0, endSoc: 5 }; // 30 min
    const plan = buildPlan({ strategy: "topup", params: p, rates: rates([20, 5, 20]), from: new Date(T0) });
    expect(plan.windows).toHaveLength(1);
    expect(plan.windows[0].start.getTime()).toBe(T0 + 30 * 60000);
    expect(plan.avgPence).toBeCloseTo(5, 4);
  });

  it("extendIntoNegative applies to the now strategy", () => {
    const p = { ...base, startSoc: 0, endSoc: 5 };
    const plan = buildPlan({ strategy: "now", params: p, rates: rates([10, -10, -10]), from: new Date(T0), extendIntoNegative: true });
    expect(plan.negativeMinutes).toBeGreaterThan(0);
    expect(plan.batteryKwh).toBeGreaterThan(3);
  });

  it("returns an empty plan for an invalid charger", () => {
    const plan = buildPlan({ strategy: "deadline", params: { ...base, chargerKw: 0 }, rates: rates([10, 10]), from: new Date(T0) });
    expect(plan.windows).toHaveLength(0);
  });
});
