/**
 * Agile Crystal Ball – pure forecasting helpers (no I/O, no React).
 *
 * DATA SOURCES (public, keyless, CORS-enabled; fetched client-side):
 *  - Wholesale: Nord Pool day-ahead (GBP/MWh, one request for the whole day), Elexon MID as fallback.
 *  - Official: Octopus public API, Agile product for region F (North East).
 *
 * WORKING FORMULA (see AGILE_ESTIMATE_CONFIG; constants are NOT confirmed):
 *   W = wholesale GBP/MWh / 10                              (p/kWh)
 *   P = peakAdderP for 16:00-19:00 Europe/London, else 0
 *   price = min(W * D + P, capP) * vat + offsetP            (offset applied after VAT)
 *   D = regional multiplier (regionMultipliers[region])
 * Calibrate the values per region against the official Agile rates (Agile tab) and keep only what matches.
 * They could not be calibrated in the build sandbox (no network access).
 */

/** Single, documented home for every tunable estimate constant. Working values, not confirmed. */
export const AGILE_ESTIMATE_CONFIG = {
  /** Default multiplier D when a region has no entry (typical range 2.0-2.4). */
  defaultMultiplier: 2.2,
  /** Regional multiplier D per Agile region code. Calibrate each against official rates. */
  regionMultipliers: {
    A: 2.2, B: 2.2, C: 2.2, D: 2.2, E: 2.2, F: 2.2, G: 2.2, H: 2.2, J: 2.2, K: 2.2, L: 2.2, M: 2.2, N: 2.2, P: 2.2,
  } as Record<string, number>,
  /** p/kWh (pre-VAT) added only for 16:00-19:00 Europe/London (start inclusive, end exclusive). */
  peakAdderP: 12,
  /** Cap in p/kWh applied to (W * D + P), before VAT. */
  capP: 95,
  /** VAT multiplier (5%). */
  vat: 1.05,
  /** Flat p/kWh offset applied AFTER VAT. */
  offsetP: -3.5,
} as const;

// ---- Other constants -------------------------------------------------------
export const AGILE_REGION_CODE = "F"; // North East England
export const UK_TZ = "Europe/London";
export const WHOLESALE_TO_P_PER_KWH = 1 / 10; // GBP/MWh -> p/kWh
export const PEAK_START_HOUR = 16; // peak window start, UK local (inclusive)
export const PEAK_END_HOUR = 19; // peak window end, UK local (exclusive)
export const DEFAULT_MULTIPLIER = AGILE_ESTIMATE_CONFIG.defaultMultiplier;
export const REGION_MULTIPLIERS = AGILE_ESTIMATE_CONFIG.regionMultipliers;
export const PEAK_ADDER_P = AGILE_ESTIMATE_CONFIG.peakAdderP;
export const VAT_MULTIPLIER = AGILE_ESTIMATE_CONFIG.vat;
export const PRICE_CAP_P = AGILE_ESTIMATE_CONFIG.capP;
export const PRICE_OFFSET_P = AGILE_ESTIMATE_CONFIG.offsetP;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const CACHE_PREFIX = "acb-slots-v1";
export const SLOT_MS = 30 * 60 * 1000;
export const CHEAP_WINDOW_SLOTS = 6; // 3 hours

export interface WholesalePoint {
  /** ISO start of the half hour */
  start: string;
  /** £/MWh */
  pricePerMwh: number;
}

export interface Slot {
  start: string; // ISO UTC
  end: string;
  label: string; // HH:mm UK
}

export interface PricedSlot extends Slot {
  /** p/kWh inc VAT, null when no data for the slot */
  price: number | null;
  isNegative: boolean;
}

const ukFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: UK_TZ, ...opts });

/** UK calendar date (YYYY-MM-DD) of an instant. */
export function ukDateKey(d: Date): string {
  const p = ukFmt({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function ukHourMinute(d: Date): { hour: number; minute: number } {
  const p = ukFmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { hour: g("hour") % 24, minute: g("minute") };
}

export function ukLabel(d: Date): string {
  const { hour, minute } = ukHourMinute(d);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** UTC instant of 00:00 UK local on the given YYYY-MM-DD. */
export function ukMidnightUtc(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // UK is UTC+0 or UTC+1: pick whichever guess formats back to local 00:00 on that date.
  for (const offsetH of [0, 1]) {
    const t = new Date(guess - offsetH * 3600000);
    if (ukDateKey(t) === dateKey && ukLabel(t) === "00:00") return t;
  }
  return new Date(guess);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Tomorrow's UK date key relative to `now`. */
export function tomorrowKey(now: Date = new Date()): string {
  return addDaysToDateKey(ukDateKey(now), 1);
}

/** Half-hour slots for a UK day: 48 normally, 46 / 50 on clock-change days. */
export function generateDaySlots(dateKey: string): Slot[] {
  const start = ukMidnightUtc(dateKey).getTime();
  const end = ukMidnightUtc(addDaysToDateKey(dateKey, 1)).getTime();
  const slots: Slot[] = [];
  for (let t = start; t < end; t += SLOT_MS) {
    const s = new Date(t);
    slots.push({ start: s.toISOString(), end: new Date(t + SLOT_MS).toISOString(), label: ukLabel(s) });
  }
  return slots;
}

export function isPeak(start: Date): boolean {
  const { hour } = ukHourMinute(start);
  return hour >= PEAK_START_HOUR && hour < PEAK_END_HOUR;
}

/** £/MWh -> p/kWh */
export function mwhToPencePerKwh(pricePerMwh: number): number {
  return pricePerMwh * WHOLESALE_TO_P_PER_KWH;
}

/** Wholesale £/MWh for a slot starting at `start` -> estimated Agile p/kWh inc VAT. */
export function estimateAgilePrice(pricePerMwh: number, start: Date, region: string = AGILE_REGION_CODE): number {
  const wholesale = mwhToPencePerKwh(pricePerMwh);
  const d = REGION_MULTIPLIERS[region] ?? DEFAULT_MULTIPLIER;
  const adder = isPeak(start) ? PEAK_ADDER_P : 0;
  const capped = Math.min(wholesale * d + adder, PRICE_CAP_P);
  return capped * VAT_MULTIPLIER + PRICE_OFFSET_P;
}

/** Hour (UK local) at which the target day rolls over to the next calendar day. */
export const ROLLOVER_HOUR_UK = 16;

/** Target UK date key: today until the UK-time cutoff, then tomorrow. */
export function targetDayKey(now: Date = new Date()): string {
  const today = ukDateKey(now);
  return ukHourMinute(now).hour >= ROLLOVER_HOUR_UK ? addDaysToDateKey(today, 1) : today;
}

/** Build tomorrow's priced slots from wholesale points. Missing slots get price null. */
export function buildEstimate(dateKey: string, wholesale: WholesalePoint[]): PricedSlot[] {
  const memoKey = `${dateKey}|${wholesale?.length ?? 0}|${wholesale?.[0]?.start}|${wholesale?.[0]?.pricePerMwh}|${wholesale?.[wholesale.length - 1]?.start}|${wholesale?.[wholesale.length - 1]?.pricePerMwh}`;
  const hit = estimateMemo.get(memoKey);
  if (hit) return hit;
  const result = computeEstimate(dateKey, wholesale);
  if (estimateMemo.size >= 16) estimateMemo.clear();
  estimateMemo.set(memoKey, result);
  return result;
}

const estimateMemo = new Map<string, PricedSlot[]>();

function computeEstimate(dateKey: string, wholesale: WholesalePoint[]): PricedSlot[] {
  const byStart = new Map<number, number>();
  for (const w of wholesale ?? []) {
    const t = new Date(w.start).getTime();
    if (Number.isFinite(t) && Number.isFinite(w.pricePerMwh)) byStart.set(t, w.pricePerMwh);
  }
  return generateDaySlots(dateKey).map((s) => {
    const w = byStart.get(new Date(s.start).getTime());
    const price = w === undefined ? null : estimateAgilePrice(w, new Date(s.start));
    return { ...s, price, isNegative: price !== null && price <= 0 };
  });
}

/** Build priced slots from official Octopus rates (value_inc_vat, p/kWh). */
export function buildOfficial(
  dateKey: string,
  rates: { valid_from: string; value_inc_vat: number }[],
): PricedSlot[] {
  const byStart = new Map<number, number>();
  for (const r of rates ?? []) {
    const t = new Date(r.valid_from).getTime();
    if (Number.isFinite(t) && Number.isFinite(r.value_inc_vat)) byStart.set(t, r.value_inc_vat);
  }
  return generateDaySlots(dateKey).map((s) => {
    const price = byStart.get(new Date(s.start).getTime()) ?? null;
    return { ...s, price, isNegative: price !== null && price <= 0 };
  });
}

export function hasFullData(slots: PricedSlot[]): boolean {
  return slots.length > 0 && slots.every((s) => s.price !== null);
}

export function cheapestSlot(slots: PricedSlot[]): PricedSlot | null {
  let best: PricedSlot | null = null;
  for (const s of slots ?? []) {
    if (s.price !== null && (best === null || s.price < (best.price as number))) best = s;
  }
  return best;
}

/** Cheapest contiguous block of `length` slots (all must have prices). Returns start index or null. */
export function cheapestWindow(
  slots: PricedSlot[],
  length: number = CHEAP_WINDOW_SLOTS,
): { startIndex: number; length: number; average: number } | null {
  const list = slots ?? [];
  let best: { startIndex: number; length: number; average: number } | null = null;
  for (let i = 0; i + length <= list.length; i++) {
    const win = list.slice(i, i + length);
    if (win.some((s) => s.price === null)) continue;
    const avg = win.reduce((a, s) => a + (s.price as number), 0) / length;
    if (best === null || avg < best.average) best = { startIndex: i, length, average: avg };
  }
  return best;
}

export const cacheKey = (dateKey: string, region: string = AGILE_REGION_CODE) => `${CACHE_PREFIX}:${dateKey}:${region}`;

/** Read cached estimate slots (null if missing, expired or malformed). */
export function loadCachedSlots(dateKey: string, region: string = AGILE_REGION_CODE, now: number = Date.now()): PricedSlot[] | null {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(cacheKey(dateKey, region));
    if (!raw) return null;
    const { savedAt, slots } = JSON.parse(raw);
    if (typeof savedAt !== "number" || now - savedAt > CACHE_TTL_MS || !Array.isArray(slots) || slots.length === 0) return null;
    return slots as PricedSlot[];
  } catch {
    return null;
  }
}

export function saveCachedSlots(dateKey: string, slots: PricedSlot[], region: string = AGILE_REGION_CODE, now: number = Date.now()): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(cacheKey(dateKey, region), JSON.stringify({ savedAt: now, slots }));
  } catch {
    /* storage unavailable or full - ignore */
  }
}

// ---- Refresh schedule ------------------------------------------------------
/** Hour (Europe/London) from which tomorrow's day-ahead auction results are normally published. */
export const PUBLISH_HOUR_UK = 11;
/** Retry interval while tomorrow's data is not yet available. */
export const RETRY_INTERVAL_MS = 5 * 60 * 1000;

/** True once the UK clock (not the browser's) has passed the usual ~11:00 publication time. */
export function isPastPublishTime(now: Date = new Date()): boolean {
  return ukHourMinute(now).hour >= PUBLISH_HOUR_UK;
}

// ---- Bar colours (shared by chart, table and legend) -------------------------
/**
 * Colours are RELATIVE to the day's estimated prices (recomputed on every render from the current
 * slots, never against fixed historic values): bottom third of the day's positive prices = "low",
 * middle third = "mid", top third = "high". Negative prices and the cheapest charging window override.
 */
export type PriceBand = "negative" | "window" | "low" | "mid" | "high";

export const BAND_COLOURS: Record<PriceBand, string> = {
  negative: "#22d3ee",
  window: "#4ade80",
  low: "#a78bfa",
  mid: "#fbbf24",
  high: "#f87171",
};

export const BAND_LABELS: Record<PriceBand, string> = {
  negative: "Negative / plunge (≤ 0p)",
  window: "Cheapest charging window",
  low: "Lowest third of the day",
  mid: "Middle third of the day",
  high: "Highest third of the day",
};

/** Day percentile thresholds (33rd / 67th) of the priced slots. */
export function dayThresholds(slots: PricedSlot[]): { low: number; high: number } | null {
  const v = (slots ?? []).filter((s) => s.price !== null && s.price > 0).map((s) => s.price as number).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const at = (q: number) => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  return { low: at(1 / 3), high: at(2 / 3) };
}

export function priceBand(
  slot: PricedSlot,
  thresholds: { low: number; high: number } | null,
  inCheapWindow: boolean,
): PriceBand {
  if (slot.isNegative) return "negative";
  if (inCheapWindow) return "window";
  if (slot.price === null || thresholds === null) return "mid";
  if (slot.price < thresholds.low) return "low";
  if (slot.price >= thresholds.high) return "high";
  return "mid";
}
