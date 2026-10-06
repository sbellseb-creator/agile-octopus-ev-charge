import type { ChargeSession } from "@/lib/charge-data";
import { recalcSessionCost } from "@/lib/session-cost";
import { ukClockToIso } from "@/lib/timezone";

export const DEFAULT_CHARGER_KW = 6.9;
export const DEFAULT_EFFICIENCY_PCT = 90;

export interface ManualEnergyInput {
  startSoc: number;
  endSoc: number;
  batteryKwh?: number | null;
  efficiencyPct?: number | null;
  chargerKw?: number | null;
  hours: number;
}

export interface ManualEnergyEstimate {
  batteryKwh: number;
  gridKwh: number;
  source: "soc_estimate" | "time_estimate";
}

/** Duration in hours of a session window; an end before the start rolls to the next day. */
export function sessionDurationHours(date: string, start: string, end: string): number {
  const s = ukClockToIso(date, start);
  const e = ukClockToIso(date, end);
  if (!s || !e) return 0;
  let ms = new Date(e).getTime() - new Date(s).getTime();
  if (ms <= 0) ms += 24 * 60 * 60 * 1000;
  return ms / 3_600_000;
}

/**
 * Estimate energy for a past session. Prefers SoC change x battery size when the
 * battery capacity is known, otherwise falls back to charger power x time.
 */
export function estimateManualEnergy(input: ManualEnergyInput): ManualEnergyEstimate | null {
  const eff = input.efficiencyPct && input.efficiencyPct > 0 ? Math.min(input.efficiencyPct, 100) : DEFAULT_EFFICIENCY_PCT;
  const socDelta = input.endSoc - input.startSoc;
  if (input.batteryKwh && input.batteryKwh > 0 && Number.isFinite(socDelta) && socDelta > 0) {
    const battery = (socDelta / 100) * input.batteryKwh;
    return {
      batteryKwh: Number(battery.toFixed(2)),
      gridKwh: Number((battery / (eff / 100)).toFixed(2)),
      source: "soc_estimate",
    };
  }
  if (input.hours > 0) {
    const kw = input.chargerKw && input.chargerKw > 0 ? input.chargerKw : DEFAULT_CHARGER_KW;
    const grid = kw * input.hours;
    return {
      batteryKwh: Number((grid * (eff / 100)).toFixed(2)),
      gridKwh: Number(grid.toFixed(2)),
      source: "time_estimate",
    };
  }
  return null;
}

export interface ManualSessionInput {
  session_date: string;
  start_time: string;
  end_time: string;
  start_soc: number;
  end_soc: number;
  batteryKwh?: number | null;
  efficiencyPct?: number | null;
  chargerKw?: number | null;
  region?: string;
}

export interface ManualSessionCalc {
  energy_added_kwh: number;
  grid_kwh: number;
  estimated_grid_energy_kwh: number;
  total_cost_gbp: number;
  avg_pence_per_kwh: number;
  num_slots: number;
  slot_prices: NonNullable<ChargeSession["slot_prices"]>;
  energy_source: "soc_estimate" | "time_estimate";
}

/** Calculate energy and Agile cost for a past session from its time window and SoC. */
export async function calculateManualSession(input: ManualSessionInput): Promise<ManualSessionCalc | null> {
  const hours = sessionDurationHours(input.session_date, input.start_time, input.end_time);
  const energy = estimateManualEnergy({
    startSoc: input.start_soc,
    endSoc: input.end_soc,
    batteryKwh: input.batteryKwh,
    efficiencyPct: input.efficiencyPct,
    chargerKw: input.chargerKw,
    hours,
  });
  if (!energy) return null;

  const cost = await recalcSessionCost(
    { session_date: input.session_date, region: input.region } as ChargeSession,
    {
      start_time: input.start_time,
      end_time: input.end_time,
      estimated_grid_energy_kwh: energy.gridKwh,
    },
  );
  if (!cost) return null;

  return {
    energy_added_kwh: energy.batteryKwh,
    grid_kwh: energy.gridKwh,
    estimated_grid_energy_kwh: cost.estimated_grid_energy_kwh,
    total_cost_gbp: cost.total_cost_gbp,
    avg_pence_per_kwh: cost.avg_pence_per_kwh,
    num_slots: cost.num_slots,
    slot_prices: cost.slot_prices,
    energy_source: energy.source,
  };
}
