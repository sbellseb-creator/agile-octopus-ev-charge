/**
 * Agile Crystal Ball – pure forecasting helpers (no I/O, no React).
 *
 * DATA SOURCES (both public, keyless and CORS-enabled; fetched client-side):
 *  - Wholesale: Elexon Insights API "MID" (Market Index Data), £/MWh per
 *    half-hour settlement period, provider APXMIDP (EPEX SPOT GB).
 *    https://data.elexon.co.uk/bmrs/api/v1/datasets/MID
 *  - Official: Octopus public API, Agile product for region F (North East).
 *
 * FORMULA (approximation of the published Agile formula - tune constants below):
 *   p/kWh = wholesale(£/MWh) / 10
 *   p/kWh = p/kWh * multiplier(peak or off-peak) + REGIONAL_ADJUSTMENT_P
 *   p/kWh = clamp(p/kWh, floor, cap)   (cap/floor applied to the VAT-inclusive price)
 *   inc VAT = ex VAT * 1.05
 */

// ---- Tunable constants -----------------------------------------------------
export const AGILE_REGION_CODE = "F"; // North East England
export const UK_TZ = "Europe/London";
export const WHOLESALE_TO_P_PER_KWH = 1 / 10; // £/MWh -> p/kWh
export const PEAK_START_HOUR = 16; // peak window start, UK local (inclusive)
export const PEAK_END_HOUR = 19; // peak window end, UK local (exclusive)
export const PEAK_MULTIPLIER = 2.1; // applied to wholesale during the peak
export const OFF_PEAK_MULTIPLIER = 1.0; // applied to wholesale outside the peak
export const REGIONAL_ADJUSTMENT_P = 1.5; // p/kWh ex VAT, distribution/loss adjustment for region F (estimate)
export const VAT_MULTIPLIER = 1.05;
export const PRICE_CAP_P = 100; // p/kWh inc VAT
export const PRICE_FLOOR_P = -100; // sanity floor only; Agile can go negative
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
export function estimateAgilePrice(pricePerMwh: number, start: Date): number {
  const wholesale = mwhToPencePerKwh(pricePerMwh);
  const mult = isPeak(start) ? PEAK_MULTIPLIER : OFF_PEAK_MULTIPLIER;
  const incVat = (wholesale * mult + REGIONAL_ADJUSTMENT_P) * VAT_MULTIPLIER;
  return Math.min(PRICE_CAP_P, Math.max(PRICE_FLOOR_P, incVat));
}

/** Build tomorrow's priced slots from wholesale points. Missing slots get price null. */
export function buildEstimate(dateKey: string, wholesale: WholesalePoint[]): PricedSlot[] {
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
