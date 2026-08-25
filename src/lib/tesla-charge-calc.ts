/**
 * Calculate realistic charge time and grid energy from Tesla telemetry.
 * 
 * Tesla's time_to_full_charge estimate is often wildly inaccurate because:
 * 1. It doesn't account for charging pauses or ramps
 * 2. It assumes constant power, but charging tapers significantly near 100%
 * 3. It's based on Tesla's internal battery model which may differ from SoC readings
 * 
 * This module derives more accurate values from actual observed power and SoC.
 */

export interface ChargeCalculation {
  /** Realistic time to reach target SoC in hours */
  estimatedHours: number;
  /** Grid energy required (includes estimated charger losses) */
  gridEnergyKwh: number;
  /** Observed average charger power in kW */
  averagePowerKw: number;
  /** Confidence level: 0.0-1.0 */
  confidence: number;
  /** Reason if confidence is low */
  confidenceReason?: string;
}

/**
 * Calculate charge time from battery delta and observed power.
 * 
 * @param startSoc Starting state of charge (%)
 * @param endSoc Target state of charge (%)
 * @param batteryKwh Total battery capacity
 * @param observedPowerKw Average observed charger power (from Tesla telemetry)
 * @param chargerEfficiency Grid-to-battery efficiency (typically 0.85-0.92)
 * @returns Calculation with estimated hours and grid energy
 */
export function calculateChargeFromPower(
  startSoc: number,
  endSoc: number,
  batteryKwh: number,
  observedPowerKw: number,
  chargerEfficiency = 0.9,
): ChargeCalculation {
  // Clamp SoC values
  const clampedStart = Math.max(0, Math.min(100, startSoc || 0));
  const clampedEnd = Math.max(clampedStart, Math.min(100, endSoc || 100));
  
  const socDelta = clampedEnd - clampedStart;
  
  // Battery energy needed (before losses)
  const batteryEnergyKwh = (batteryKwh * socDelta) / 100;
  
  // Grid energy accounting for charger losses
  const gridEnergyKwh = chargerEfficiency > 0 
    ? batteryEnergyKwh / chargerEfficiency 
    : batteryEnergyKwh;
  
  // Hours to deliver that grid energy at observed power
  let estimatedHours: number;
  let confidence = 0.9;
  let confidenceReason: string | undefined;
  
  if (observedPowerKw <= 0) {
    // No power observed - can't estimate
    estimatedHours = 3; // Fallback
    confidence = 0.1;
    confidenceReason = "No observed charger power";
  } else {
    estimatedHours = gridEnergyKwh / observedPowerKw;
    
    // Penalize estimate if charging very slowly (might be paused intermittently)
    if (observedPowerKw < 1) {
      confidence = 0.3;
      confidenceReason = "Very low observed power - possible pauses or throttling";
    }
    // Penalize if charging close to 100% (significant taper expected)
    else if (clampedEnd >= 95) {
      confidence = 0.6;
      confidenceReason = "Charging to high SoC - charger will taper significantly";
    }
  }
  
  // Round to nearest 0.25 hours (15 min intervals)
  const roundedHours = Math.ceil(estimatedHours * 4) / 4;
  
  return {
    estimatedHours: roundedHours,
    gridEnergyKwh: Number(gridEnergyKwh.toFixed(2)),
    averagePowerKw: Math.round(observedPowerKw * 100) / 100,
    confidence,
    confidenceReason,
  };
}

/**
 * Validate energy measurement against SoC delta and vice versa.
 * Returns the more reliable value based on deviation analysis.
 * 
 * @param startSoc Start battery percentage
 * @param endSoc End battery percentage
 * @param batteryKwh Battery capacity
 * @param observedGridEnergyKwh Measured/observed grid energy from Tesla
 * @param chargerEfficiency Expected charger efficiency
 * @returns { energy: gridEnergyKwh, method: 'tesla' | 'soc', confidence: 0-1 }
 */
export function validateEnergyMeasurement(
  startSoc: number,
  endSoc: number,
  batteryKwh: number,
  observedGridEnergyKwh: number,
  chargerEfficiency = 0.9,
): {
  energy: number;
  method: 'tesla' | 'soc';
  confidence: number;
  explanation: string;
} {
  const socDelta = endSoc - startSoc;
  const batteryEnergy = (batteryKwh * socDelta) / 100;
  
  // What grid energy SHOULD be based on SoC
  const expectedGridEnergy = batteryEnergy / chargerEfficiency;
  
  if (socDelta <= 0 || batteryEnergy < 0.1) {
    // Incomplete charge
    return {
      energy: Math.max(0, observedGridEnergyKwh),
      method: 'tesla',
      confidence: 0.4,
      explanation: 'Minimal SoC change - incomplete charge observation',
    };
  }
  
  // Calculate ratio: observed vs expected
  const ratio = observedGridEnergyKwh > 0 
    ? observedGridEnergyKwh / expectedGridEnergy 
    : 0;
  
  // Tesla's energy counter is reliable in range 0.7-1.45 (accounting for loss variation)
  const teslaReliable = ratio >= 0.7 && ratio <= 1.45;
  
  if (teslaReliable && observedGridEnergyKwh > 0.25) {
    // Tesla measurement makes sense
    return {
      energy: Number(observedGridEnergyKwh.toFixed(2)),
      method: 'tesla',
      confidence: 0.92,
      explanation: `Tesla measured ${observedGridEnergyKwh.toFixed(2)} kWh (ratio: ${ratio.toFixed(2)}x SoC delta)`,
    };
  }
  
  if (ratio < 0.7) {
    // Tesla reading too low - might be missing energy or wrong baseline
    return {
      energy: Number(expectedGridEnergy.toFixed(2)),
      method: 'soc',
      confidence: 0.68,
      explanation: `Tesla reading (${observedGridEnergyKwh.toFixed(2)} kWh) too low vs SoC delta (${socDelta}%) - using SoC estimate`,
    };
  }
  
  if (ratio > 1.45) {
    // Tesla reading too high - might include charger idle draw
    // Use average of both estimates
    const averaged = (observedGridEnergyKwh + expectedGridEnergy) / 2;
    return {
      energy: Number(averaged.toFixed(2)),
      method: 'soc',
      confidence: 0.55,
      explanation: `Tesla reading (${observedGridEnergyKwh.toFixed(2)} kWh) unusually high vs SoC delta - using averaged estimate`,
    };
  }
  
  // Fallback to SoC-based estimate
  return {
    energy: Number(expectedGridEnergy.toFixed(2)),
    method: 'soc',
    confidence: 0.65,
    explanation: `Using SoC delta (${socDelta}%) to estimate ${expectedGridEnergy.toFixed(2)} kWh`,
  };
}

/**
 * Calculate cost based on actual slot prices and energy.
 * Accounts for partial slot usage.
 */
export function calculateCostFromSlots(
  gridEnergyKwh: number,
  slots: Array<{ valid_from: string; valid_to: string; value_inc_vat: number }>,
): { totalCostGbp: number; avgPricePence: number } {
  if (slots.length === 0 || gridEnergyKwh <= 0) {
    return { totalCostGbp: 0, avgPricePence: 0 };
  }
  
  // Assume 30-minute slots
  const energyPerSlot = gridEnergyKwh / slots.length;
  
  const totalCost = slots.reduce((sum, slot) => {
    const costPence = energyPerSlot * slot.value_inc_vat;
    return sum + costPence;
  }, 0);
  
  return {
    totalCostGbp: Number((totalCost / 100).toFixed(2)),
    avgPricePence: Number((totalCost / gridEnergyKwh).toFixed(2)),
  };
}
