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
  batteryCapacityFor: (session: any) => number | undefined,
): HistoricalChargeCorrection[] {
  const safeSessions = Array.isArray(sessions) ? sessions.filter(s => s && typeof s === 'object') : [];
  
  return safeSessions.flatMap((session) => {
    try {
      if (!session || !session.id || session.source !== "tesla") return [];

      // 🛡️ TYPE-SAFE DATA FALLBACK INTERCEPTOR
      // Safely check if the callback expects a session object or a vehicle_id string
      let capacity: number | undefined = undefined;
      try {
        capacity = batteryCapacityFor(session) ?? batteryCapacityFor(session.vehicle_id) ?? 75;
      } catch (e) {
        capacity = 75; // Safe default EV battery standard capacity
      }

      const socDelta = (Number(session.end_soc) || 0) - (Number(session.start_soc) || 0);
      const socEnergy = capacity && capacity > 0 && socDelta > 0
        ? (capacity * socDelta) / 100
        : 0;
        
      const teslaEnergy = Number(session.actual_energy_kwh ?? session.energy_added_kwh ?? 0);

      if (!Number.isFinite(teslaEnergy) || teslaEnergy <= 0 || socEnergy <= 0) {
        return [];
      }

      const discrepancy = Math.abs(teslaEnergy - socEnergy) / socEnergy;
      if (discrepancy <= MINIMUM_IMPROVEMENT) return [];

      const gridEnergy = Number((socEnergy / CHARGER_EFFICIENCY).toFixed(2));
      const totalCost = Number(
        (gridEnergy * (Number(session.avg_pence_per_kwh) || 0) / 100).toFixed(2),
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
    } catch (err) {
      console.error("Skipped recalculation record processing step anomaly:", err);
      return [];
    }
  });
}
