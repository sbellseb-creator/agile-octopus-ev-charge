/**
 * Minute-accurate charge planning. Pure functions only — no UI, storage or
 * network access — so the maths can be tested in isolation.
 *
 * Prices are Agile-style p/kWh (inc VAT) and may be negative.
 */

export interface PlanRate {
  valid_from: string; // ISO
  valid_to: string; // ISO
  value_inc_vat: number; // p/kWh
}

export interface ChargeParams {
  batteryKwh: number;
  startSoc: number; // %
  endSoc: number; // %
  /** Power drawn from the wall in kW. */
  chargerKw: number;
  /** Fraction of grid energy that reaches the battery (0–1). */
  efficiency: number;
  /** SoC (%) above which charging slows down. Omit for no taper. */
  taperAboveSoc?: number;
  /** Fraction of full power used above taperAboveSoc (0–1). */
  taperPowerFactor?: number;
}

export type PlanStrategy = "now" | "deadline" | "threshold" | "topup";

export interface PlanRequest {
  strategy: PlanStrategy;
  params: ChargeParams;
  rates: PlanRate[];
  /** Plug-in time; charging cannot start before this. */
  from: Date;
  /** Unplug / ready-by time; charging cannot continue after this. */
  until?: Date | null;
  /** p/kWh ceiling for the "threshold" strategy. */
  thresholdPence?: number;
  /** Keep charging above endSoc (up to 100%) while the price is negative. */
  extendIntoNegative?: boolean;
}

export interface PlanWindow {
  start: Date;
  end: Date;
  minutes: number;
  gridKwh: number;
  batteryKwh: number;
  costGbp: number;
  avgPence: number;
  hasNegative: boolean;
}

export interface ChargePlan {
  windows: PlanWindow[];
  totalMinutes: number;
  gridKwh: number;
  batteryKwh: number;
  costGbp: number;
  avgPence: number;
  startSoc: number;
  finalSoc: number;
  targetReached: boolean;
  shortfallKwh: number;
  negativeMinutes: number;
  /** Money earned from charging during negative-price minutes (positive number, £). */
  negativeEarningsGbp: number;
  start: Date | null;
  end: Date | null;
}

const MINUTE_MS = 60_000;

interface MinutePrice {
  t: number; // ms, start of minute
  price: number;
}

export function clampPercent(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, v));
}

function gridKwAt(p: ChargeParams, soc: number): number {
  const taper =
    p.taperAboveSoc !== undefined && soc >= p.taperAboveSoc
      ? Math.min(1, Math.max(0.05, p.taperPowerFactor ?? 0.5))
      : 1;
  return p.chargerKw * taper;
}

function safeEfficiency(p: ChargeParams): number {
  return p.efficiency > 0 && p.efficiency <= 1 ? p.efficiency : 1;
}

/** Wall-clock minutes (fractional) needed to go from startSoc to endSoc, ignoring prices. */
export function minutesToReachSoc(p: ChargeParams, endSoc = p.endSoc): number {
  if (p.chargerKw <= 0 || p.batteryKwh <= 0) return Infinity;
  const eff = safeEfficiency(p);
  let soc = clampPercent(p.startSoc, 0);
  const target = clampPercent(endSoc, 100);
  let minutes = 0;
  while (soc < target - 1e-9) {
    const batteryKwhPerMin = (gridKwAt(p, soc) * eff) / 60;
    const socPerMin = (batteryKwhPerMin / p.batteryKwh) * 100;
    const remaining = target - soc;
    if (socPerMin >= remaining) {
      minutes += remaining / socPerMin;
      break;
    }
    soc += socPerMin;
    minutes += 1;
    if (minutes > 60 * 24 * 7) return Infinity;
  }
  return minutes;
}

/** Expand half-hour rates into one price per minute inside [fromMs, untilMs). */
export function expandToMinutes(rates: PlanRate[], fromMs: number, untilMs: number): MinutePrice[] {
  const out: MinutePrice[] = [];
  const sorted = [...rates].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  for (const r of sorted) {
    const rs = new Date(r.valid_from).getTime();
    const re = new Date(r.valid_to).getTime();
    if (!Number.isFinite(rs) || !Number.isFinite(re)) continue;
    const s = Math.max(rs, fromMs);
    const e = Math.min(re, untilMs);
    for (let t = Math.ceil(s / MINUTE_MS) * MINUTE_MS; t + MINUTE_MS <= e; t += MINUTE_MS) {
      out.push({ t, price: r.value_inc_vat });
    }
  }
  return out;
}

function emptyPlan(p: ChargeParams): ChargePlan {
  const soc = clampPercent(p.startSoc, 0);
  return {
    windows: [],
    totalMinutes: 0,
    gridKwh: 0,
    batteryKwh: 0,
    costGbp: 0,
    avgPence: 0,
    startSoc: soc,
    finalSoc: soc,
    targetReached: soc >= clampPercent(p.endSoc, 100),
    shortfallKwh: 0,
    negativeMinutes: 0,
    negativeEarningsGbp: 0,
    start: null,
    end: null,
  };
}

/**
 * Simulate charging over the given minutes (chronological) and build a plan.
 * A minute is used while SoC is below endSoc, or — when extendIntoNegative is
 * set — below 100% and the minute's price is negative. The final minute may be
 * partial; cost and energy are scaled accordingly.
 */
export function simulateMinutes(
  p: ChargeParams,
  minutes: MinutePrice[],
  extendIntoNegative = false,
): ChargePlan {
  const plan = emptyPlan(p);
  const eff = safeEfficiency(p);
  const target = clampPercent(p.endSoc, 100);
  let soc = plan.startSoc;
  let current: PlanWindow | null = null;
  const sorted = [...minutes].sort((a, b) => a.t - b.t);

  for (const m of sorted) {
    const cap = extendIntoNegative && m.price < 0 ? 100 : target;
    if (soc >= cap - 1e-9) continue;
    const gridKw = gridKwAt(p, soc);
    const batteryPerMin = (gridKw * eff) / 60;
    const socPerMin = (batteryPerMin / p.batteryKwh) * 100;
    if (!(socPerMin > 0)) break;
    const fraction = Math.min(1, (cap - soc) / socPerMin);
    const grid = (gridKw / 60) * fraction;
    const battery = batteryPerMin * fraction;
    const cost = (grid * m.price) / 100;
    soc += socPerMin * fraction;

    if (!current || current.end.getTime() !== m.t) {
      current = {
        start: new Date(m.t),
        end: new Date(m.t),
        minutes: 0,
        gridKwh: 0,
        batteryKwh: 0,
        costGbp: 0,
        avgPence: 0,
        hasNegative: false,
      };
      plan.windows.push(current);
    }
    current.end = new Date(m.t + MINUTE_MS);
    current.minutes += fraction;
    current.gridKwh += grid;
    current.batteryKwh += battery;
    current.costGbp += cost;
    if (m.price < 0) {
      current.hasNegative = true;
      plan.negativeMinutes += fraction;
      plan.negativeEarningsGbp += -cost;
    }
  }

  for (const w of plan.windows) {
    w.avgPence = w.gridKwh > 0 ? (w.costGbp / w.gridKwh) * 100 : 0;
    plan.totalMinutes += w.minutes;
    plan.gridKwh += w.gridKwh;
    plan.batteryKwh += w.batteryKwh;
    plan.costGbp += w.costGbp;
  }
  plan.avgPence = plan.gridKwh > 0 ? (plan.costGbp / plan.gridKwh) * 100 : 0;
  plan.finalSoc = soc;
  plan.targetReached = soc >= target - 0.05;
  plan.shortfallKwh = Math.max(0, ((target - soc) / 100) * p.batteryKwh);
  plan.start = plan.windows[0]?.start ?? null;
  plan.end = plan.windows[plan.windows.length - 1]?.end ?? null;
  return plan;
}

/** Cost of an arbitrary plug-in → unplug period, charging flat out from `from`. */
export function costBetween(p: ChargeParams, rates: PlanRate[], from: Date, to: Date): ChargePlan {
  return simulateMinutes({ ...p, endSoc: 100 }, expandToMinutes(rates, from.getTime(), to.getTime()));
}

export function buildPlan(req: PlanRequest): ChargePlan {
  const { params, rates, strategy } = req;
  const fromMs = Math.floor(req.from.getTime() / MINUTE_MS) * MINUTE_MS;
  const untilMs = req.until ? req.until.getTime() : Infinity;
  const target = clampPercent(params.endSoc, 100);
  if (clampPercent(params.startSoc, 0) >= target && !req.extendIntoNegative) return emptyPlan(params);
  if (untilMs <= fromMs) return emptyPlan(params);

  const horizon = untilMs === Infinity ? Number.MAX_SAFE_INTEGER : untilMs;
  const minutes = expandToMinutes(rates, fromMs, horizon);
  if (minutes.length === 0) return emptyPlan(params);
  const extend = !!req.extendIntoNegative;

  if (strategy === "now") return simulateMinutes(params, minutes, extend);

  if (strategy === "threshold") {
    const limit = req.thresholdPence ?? 0;
    return simulateMinutes(
      params,
      minutes.filter((m) => m.price <= limit),
      extend,
    );
  }

  // "deadline" and "topup": pick the cheapest minutes needed to reach the target.
  const needed = Math.ceil(minutesToReachSoc(params, target));
  if (!Number.isFinite(needed)) return emptyPlan(params);
  const cheapest = [...minutes].sort((a, b) => a.price - b.price || a.t - b.t).slice(0, needed);
  const chosen = new Set(cheapest.map((m) => m.t));
  const pool = extend ? minutes.filter((m) => chosen.has(m.t) || m.price < 0) : cheapest;
  return simulateMinutes(params, pool, extend);
}
