import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/octopus-api", () => ({
  fetchAgileRates: vi.fn(async () => [
    { valid_from: "2026-08-01T00:00:00Z", valid_to: "2026-08-01T00:30:00Z", value_inc_vat: 10 },
    { valid_from: "2026-08-01T00:30:00Z", valid_to: "2026-08-01T01:00:00Z", value_inc_vat: 20 },
  ]),
}));

import { calculateManualSession, estimateManualEnergy, sessionDurationHours } from "@/lib/manual-session";

describe("manual session estimation", () => {
  it("computes duration, rolling past midnight", () => {
    expect(sessionDurationHours("2026-08-01", "01:00", "02:30")).toBe(1.5);
    expect(sessionDurationHours("2026-08-01", "23:00", "01:00")).toBe(2);
  });

  it("estimates energy from SoC when battery size is known", () => {
    const e = estimateManualEnergy({ startSoc: 20, endSoc: 70, batteryKwh: 60, efficiencyPct: 90, hours: 3 });
    expect(e).toEqual({ batteryKwh: 30, gridKwh: 33.33, source: "soc_estimate" });
  });

  it("falls back to charger power x time", () => {
    const e = estimateManualEnergy({ startSoc: 20, endSoc: 70, chargerKw: 7, efficiencyPct: 100, hours: 2 });
    expect(e).toEqual({ batteryKwh: 14, gridKwh: 14, source: "time_estimate" });
  });

  it("costs the time window using Agile slot prices (BST -> UTC)", async () => {
    // 01:00-02:00 BST = 00:00-01:00 UTC; 7kW for 1h, 10p then 20p
    const r = await calculateManualSession({
      session_date: "2026-08-01",
      start_time: "01:00",
      end_time: "02:00",
      start_soc: 20,
      end_soc: 40,
      chargerKw: 7,
      efficiencyPct: 100,
    });
    expect(r?.grid_kwh).toBe(7);
    expect(r?.total_cost_gbp).toBe(1.05);
    expect(r?.avg_pence_per_kwh).toBe(15);
  });
});
