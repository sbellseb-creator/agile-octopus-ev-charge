import type { ChargeSession } from "@/lib/charge-data";

const CHARGER_EFFICIENCY = 0.9;
const MINIMUM_IMPROVEMENT = 0.05;
const SOC_ESTIMATE_CONFIDENCE_SCORE = 0.68;

export interface HistoricalChargeCorrection {
  id: string;
  updates: Partial<ChargeSession>;
}

/**
 * Correct Tesla sessions whose recorded energy conflicts materially with the
 * battery's observed state-of-charge change.
 */
export function recalculateHistoricalSessions(
  sessions: ChargeSession[],
  batteryCapacityFor: (session: ChargeSession) => number | undefined,
): HistoricalChargeCorrection[] {
  return sessions.flatMap((session) => {
    if (session.source !== "tesla") return [];

    const capacity = batteryCapacityFor(session);
    const socDelta = session.end_soc - session.start_soc;
    const socEnergy = capacity && capacity > 0 && socDelta > 0
      ? capacity * socDelta / 100
      : 0;
    const teslaEnergy = Number(session.actual_energy_kwh ?? session.energy_added_kwh);

    if (!Number.isFinite(teslaEnergy) || teslaEnergy <= 0 || socEnergy <= 0) {
      return [];
    }

    const discrepancy = Math.abs(teslaEnergy - socEnergy) / socEnergy;
    if (discrepancy <= MINIMUM_IMPROVEMENT) return [];

    const gridEnergy = Number((socEnergy / CHARGER_EFFICIENCY).toFixed(2));
    const totalCost = Number(
      (gridEnergy * session.avg_pence_per_kwh / 100).toFixed(2),
    );
    return [{
      id: session.id,
      updates: {
        battery_energy_kwh: Number(socEnergy.toFixed(2)),
        estimated_grid_energy_kwh: gridEnergy,
        grid_kwh: gridEnergy,
        energy_added_kwh: Number(socEnergy.toFixed(2)),
        actual_energy_kwh: Number(socEnergy.toFixed(2)),
        energy_source: "soc_estimate",
        total_cost_gbp: totalCost,
        actual_cost_gbp: totalCost,
        confidence_score: SOC_ESTIMATE_CONFIDENCE_SCORE,
        raw_observations: {
          ...(session.raw_observations ?? {}),
          historical_tesla_energy_kwh: teslaEnergy,
          historical_soc_energy_kwh: Number(socEnergy.toFixed(2)),
          historical_recalculated_at: new Date().toISOString(),
        },
      },
    }];
  });
}
