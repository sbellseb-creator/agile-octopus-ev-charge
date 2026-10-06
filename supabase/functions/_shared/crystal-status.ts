// Pure, dependency-free Crystal Ball status/diagnostic logic shared by edge
// functions, the browser and unit tests. Do not import Deno or npm APIs here.
import { type PriceSlot, addDays, ukDate, ukMinutes } from "./agile-core.ts";

/** Day-ahead results are expected ~11:30 UK on the day before delivery. */
export const EXPECTED_PUBLICATION = { hour: 11, minute: 30 } as const;

export type ProviderFailureReason = "not_configured" | "auth_required" | "upstream_error" | "network_error" | "bad_response";

export class ProviderError extends Error {
  constructor(readonly reason: ProviderFailureReason, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

/** UTC instant of a UK local wall-clock time on the given date (DST-aware). */
export function ukTimeToUtc(ymd: string, hour: number, minute: number): Date {
  const guess = Date.parse(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  for (const offsetH of [0, 1]) {
    const d = new Date(guess - offsetH * 3600_000);
    if (ukDate(d) === ymd && ukMinutes(d) === hour * 60 + minute) return d;
  }
  return new Date(guess);
}

/** When the wholesale result for `targetDate` is expected to be published. */
export function expectedPublicationTime(targetDate: string): Date {
  return ukTimeToUtc(addDays(targetDate, -1), EXPECTED_PUBLICATION.hour, EXPECTED_PUBLICATION.minute);
}

export function waitingInfo(targetDate: string, now: Date) {
  const expectedAt = expectedPublicationTime(targetDate);
  const minutesPast = Math.floor((now.getTime() - expectedAt.getTime()) / 60_000);
  return { expectedAt: expectedAt.toISOString(), pastDue: minutesPast > 0, minutesPast: Math.max(0, minutesPast) };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export type CrystalState = "official" | "available" | "waiting" | "error" | "no_data";

/**
 * Distinguish: (official) official rates are out, (available) estimate exists,
 * (waiting) not published yet, (error) the fetch failed, (no_data) a past or
 * current day with no wholesale rows. A fetch error never masquerades as waiting.
 */
export function deriveCrystalState(opts: {
  date: string;
  now: Date;
  hasOfficial: boolean;
  estimateCount: number;
  fetchError?: string | null;
  loaded: boolean;
}): CrystalState {
  if (opts.hasOfficial) return "official";
  if (opts.estimateCount > 0) return "available";
  if (opts.fetchError) return "error";
  if (!opts.loaded) return "waiting";
  return opts.date > ukDate(opts.now) ? "waiting" : "no_data";
}

export interface DayCheck {
  date: string;
  rows: number;
  status: "data" | "empty" | "error";
  reason?: string;
}

/** Run the provider for each day; never throws. */
export async function checkDays(fetchDay: (ymd: string) => Promise<unknown[]>, dates: string[]): Promise<DayCheck[]> {
  const out: DayCheck[] = [];
  for (const date of dates) {
    try {
      const rows = (await fetchDay(date)).length;
      out.push({ date, rows, status: rows > 0 ? "data" : "empty" });
    } catch (e) {
      out.push({ date, rows: 0, status: "error", reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export type DiagnosticVerdict = "ok" | "provider_wrong" | "provider_failing";

/** `previous` are settled days: a healthy provider must return data for them. */
export function diagnosePreviousDays(previous: DayCheck[]): { verdict: DiagnosticVerdict; message: string } {
  if (previous.some((d) => d.status === "data")) {
    const n = previous.filter((d) => d.status === "data").length;
    return { verdict: "ok", message: `Provider returns data for ${n}/${previous.length} previous days; the source/filter is valid.` };
  }
  const firstError = previous.find((d) => d.status === "error");
  if (firstError) {
    return { verdict: "provider_failing", message: `Provider fails for previous days: ${firstError.reason}` };
  }
  return {
    verdict: "provider_wrong",
    message: "Provider returned no rows for any previous day: the dataset, endpoint, filter or time range is wrong.",
  };
}

export interface SlotComparison {
  valid_from: string;
  estimate: number | null;
  official: number;
  /** official - estimate (p/kWh). */
  diff: number | null;
}

export function compareEstimateToOfficial(estimate: PriceSlot[], official: PriceSlot[]) {
  const est = new Map(estimate.map((s) => [s.valid_from, s.value_inc_vat]));
  const slots: SlotComparison[] = official.map((o) => {
    const e = est.get(o.valid_from);
    return { valid_from: o.valid_from, estimate: e ?? null, official: o.value_inc_vat, diff: e === undefined ? null : o.value_inc_vat - e };
  });
  const diffs = slots.map((s) => s.diff).filter((d): d is number => d !== null);
  const averageDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  const meanAbsDiff = diffs.length ? diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length : null;
  return { slots, averageDiff, meanAbsDiff, compared: diffs.length };
}

export interface FitSample {
  /** Wholesale p/kWh ex VAT. */
  wholesale: number;
  /** Official unit rate p/kWh inc VAT. */
  official: number;
  peak: boolean;
}

/**
 * Least-squares fit of official/VAT = multiplier * wholesale + peakAdder * peak
 * (ignoring capped/floored slots). Used to calibrate the formula constants
 * against real official rates instead of guessing. Returns null if there is
 * not enough varied data.
 */
export function fitFormula(samples: FitSample[], vatFactor: number, cap: number, floor: number) {
  const use = samples.filter((s) => s.official < cap - 0.01 && s.official > floor + 0.01 && Number.isFinite(s.wholesale));
  if (use.length < 10) return null;
  let ww = 0, wp = 0, pp = 0, wy = 0, py = 0;
  for (const s of use) {
    const y = s.official / vatFactor;
    const p = s.peak ? 1 : 0;
    ww += s.wholesale * s.wholesale; wp += s.wholesale * p; pp += p; wy += s.wholesale * y; py += p * y;
  }
  const det = ww * pp - wp * wp;
  if (ww === 0 || pp === 0 || Math.abs(det) < 1e-9) return null;
  return { multiplier: (wy * pp - wp * py) / det, peakAdder: (ww * py - wp * wy) / det, samples: use.length };
}
