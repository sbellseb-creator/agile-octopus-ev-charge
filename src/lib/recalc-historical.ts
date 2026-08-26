import { recalcSessionCost } from "@/lib/session-cost";
import { validateEnergyMeasurement } from "@/lib/tesla-charge-calc";
import { loadSessions, updateSession } from "@/lib/charge-data";
import type { ChargeSession } from "@/lib/charge-data";

/**
 * Batch recalculate all historical charges with the improved validation logic.
 * 
 * This function:
 * 1. Checks each charge's energy measurement (Tesla vs SoC delta)
 * 2. Validates against charger efficiency baseline
 * 3. Recalculates costs using actual slot prices
 * 4. Only updates sessions where energy/cost is significantly wrong
 * 
 * Safe to run on every app load — it's non-blocking and skips unchanged sessions.
 * 
 * @param batteryKwhLookup Function to get battery capacity for a vehicle
 * @returns Promise<{ updatedCount: number; totalSessions: number }>
 */
export async function recalculateHistoricalCharges(
  batteryKwhLookup: (vehicleId: string) => number | null,
): Promise<{
  updatedCount: number;
  totalSessions: number;
  details: Array<{
    sessionId: string;
    date: string;
    reason: string;
    oldCost: number;
    newCost: number;
    energyMethod: 'tesla' | 'soc';
  }>;
}> {
  const sessions = loadSessions();
  let updatedCount = 0;
  const details: Array<{
    sessionId: string;
    date: string;
    reason: string;
    oldCost: number;
    newCost: number;
    energyMethod: 'tesla' | 'soc';
  }> = [];

  for (const session of sessions) {
    // Skip incomplete sessions
    if (session.end_soc <= session.start_soc || session.energy_added_kwh < 0.25) {
      continue;
    }

    // Skip sessions without slot prices (can't recalculate accurately)
    if (!session.slot_prices || session.slot_prices.length === 0) {
      continue;
    }

    const batteryKwh = batteryKwhLookup(session.vehicle_id);
    if (!batteryKwh || batteryKwh < 30) {
      continue; // Insufficient data
    }

    // Get current energy value (Tesla measured or estimated)
    const currentGridEnergy =
      session.measured_grid_energy_kwh ||
      session.estimated_grid_energy_kwh ||
      session.grid_kwh ||
      0;

    // Validate the energy measurement
    const validation = validateEnergyMeasurement(
      session.start_soc,
      session.end_soc,
      batteryKwh,
      currentGridEnergy,
      0.9,
    );

    // Check if the energy changed significantly
    const energyDiff = Math.abs(validation.energy - currentGridEnergy);
    const energyPercent = currentGridEnergy > 0 
      ? (energyDiff / currentGridEnergy) * 100 
      : 0;

    // Only update if energy changes by more than 5% or method changed significantly
    if (energyPercent < 5 && validation.method === session.energy_source) {
      continue; // No significant change needed
    }

    // Recalculate cost with the new energy value
    const oldCost = session.total_cost_gbp || 0;
    
    try {
      const costRecalc = await recalcSessionCost(session, {
        measured_grid_energy_kwh: validation.method === 'tesla' 
          ? validation.energy 
          : undefined,
        estimated_grid_energy_kwh: validation.method === 'soc' 
          ? validation.energy 
          : undefined,
        energy_source: validation.method === 'tesla' ? 'tesla' : 'soc_estimate',
      });

      if (costRecalc) {
        const newCost = costRecalc.total_cost_gbp;
        const costDiff = Math.abs(newCost - oldCost);

        if (costDiff > 0.01) {
          // Cost changed meaningfully, update the session
          updateSession(session.id, {
            measured_grid_energy_kwh: validation.method === 'tesla' 
              ? validation.energy 
              : undefined,
            estimated_grid_energy_kwh: validation.method === 'soc' 
              ? validation.energy 
              : undefined,
            grid_kwh: validation.energy,
            energy_source: validation.method === 'tesla' ? 'tesla' : 'soc_estimate',
            total_cost_gbp: newCost,
            avg_pence_per_kwh: costRecalc.avg_pence_per_kwh,
            num_slots: costRecalc.num_slots,
            slot_prices: costRecalc.slot_prices,
            notes: `${session.notes} [Recalculated with improved validation]`.trim(),
          });

          updatedCount++;
          details.push({
            sessionId: session.id,
            date: session.session_date,
            reason: validation.explanation,
            oldCost,
            newCost,
            energyMethod: validation.method,
          });

          console.log(
            `Recalculated session ${session.id} (${session.session_date}): ` +
            `£${oldCost.toFixed(2)} → £${newCost.toFixed(2)} ` +
            `using ${validation.method}`,
          );
        }
      }
    } catch (error) {
      console.warn(
        `Failed to recalculate session ${session.id}:`,
        error,
      );
    }
  }

  return {
    updatedCount,
    totalSessions: sessions.length,
    details,
  };
}

/**
 * Check if historical recalculation has been run.
 * Returns true if we've already processed the sessions once.
 */
export function hasRunHistoricalRecalc(): boolean {
  try {
    const flag = localStorage.getItem("historical-recalc-completed");
    return flag === "true";
  } catch {
    return false;
  }
}

/**
 * Mark that historical recalculation has been completed.
 */
export function setHistoricalRecalcCompleted(): void {
  try {
    localStorage.setItem("historical-recalc-completed", "true");
  } catch {
    // Ignore storage errors
  }
}
