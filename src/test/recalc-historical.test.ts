import { describe, expect, it } from "vitest";
import type { ChargeSession } from "@/lib/charge-data";
import { recalculateHistoricalSessions } from "@/lib/recalc-historical";

const session: ChargeSession = {
  id: "tesla-1",
  source: "tesla",
  session_date: "2026-08-01",
  vehicle_id: "vehicle-1",
  vehicle_name: "Tesla",
  charge_mode: "realtime",
  start_soc: 40,
  end_soc: 60,
  energy_added_kwh: 25,
  grid_kwh: 25,
  total_cost_gbp: 5,
  avg_pence_per_kwh: 20,
  num_slots: 2,
  tariff_code: "Agile",
  notes: "",
};

describe("historical Tesla charge recalculation", () => {
  it("falls back to SoC energy when Tesla energy differs by more than 5%", () => {
    const [correction] = recalculateHistoricalSessions([session], () => 75);

    expect(correction.updates.energy_added_kwh).toBe(15);
    expect(correction.updates.estimated_grid_energy_kwh).toBe(16.67);
    expect(correction.updates.total_cost_gbp).toBe(3.33);
    expect(correction.updates.energy_source).toBe("soc_estimate");
  });

  it("does not rewrite Tesla sessions already within 5% of the SoC estimate", () => {
    const corrections = recalculateHistoricalSessions(
      [{ ...session, energy_added_kwh: 15.5 }],
      () => 75,
    );

    expect(corrections).toEqual([]);
  });
});
