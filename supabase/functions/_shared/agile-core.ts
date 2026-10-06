// Pure, dependency-free Agile logic shared by edge functions, the browser and
// unit tests. Do not import Deno or npm APIs here.

export const UK_TZ = "Europe/London";

/**
 * Agile formula constants. All values are CONFIGURABLE and MUST be verified
 * against the current Octopus Agile terms (they change between product
 * versions). Prices are pence/kWh inc VAT unless noted.
 */
export interface AgileFormulaConfig {
  /** Regional multiplier applied to wholesale p/kWh (ex VAT). */
  multiplier: number;
  /** Peak adder in p/kWh (ex VAT) added in the peak window. */
  peakAdder: number;
  /** Peak window, UK local hours: [peakStartHour, peakEndHour). */
  peakStartHour: number;
  peakEndHour: number;
  /** VAT factor, e.g. 1.05. */
  vatFactor: number;
  /** Price cap, p/kWh inc VAT. */
  cap: number;
  /** Price floor, p/kWh inc VAT. */
  floor: number;
}

export const DEFAULT_AGILE_FORMULA: AgileFormulaConfig = {
  multiplier: 2.2, // verify for region F against current Agile terms
  peakAdder: 12, // verify
  peakStartHour: 16,
  peakEndHour: 19,
  vatFactor: 1.05,
  cap: 100, // verify
  floor: -25, // verify
};

export function parseFormulaOverrides(raw: Record<string, string | undefined>): AgileFormulaConfig {
  const num = (v: string | undefined, d: number) => {
    const n = v === undefined || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const d = DEFAULT_AGILE_FORMULA;
  return {
    multiplier: num(raw.AGILE_MULTIPLIER, d.multiplier),
    peakAdder: num(raw.AGILE_PEAK_ADDER, d.peakAdder),
    peakStartHour: num(raw.AGILE_PEAK_START_HOUR, d.peakStartHour),
    peakEndHour: num(raw.AGILE_PEAK_END_HOUR, d.peakEndHour),
    vatFactor: num(raw.AGILE_VAT_FACTOR, d.vatFactor),
    cap: num(raw.AGILE_CAP, d.cap),
    floor: num(raw.AGILE_FLOOR, d.floor),
  };
}

function ukParts(date: Date): { ymd: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** UK calendar date (YYYY-MM-DD) for an instant. */
export function ukDate(date: Date): string {
  return ukParts(date).ymd;
}

/** UK minutes after local midnight for an instant (DST-aware). */
export function ukMinutes(date: Date): number {
  const p = ukParts(date);
  return p.hour * 60 + p.minute;
}

/** Add days to a YYYY-MM-DD string. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC instant of 00:00 UK local on the given date (DST-aware). */
export function ukMidnightUtc(ymd: string): Date {
  const guess = new Date(`${ymd}T00:00:00Z`);
  // UK is UTC+0 or UTC+1 at midnight: pick whichever maps back to 00:00 local.
  for (const offsetH of [0, 1]) {
    const d = new Date(guess.getTime() - offsetH * 3600_000);
    const p = ukParts(d);
    if (p.ymd === ymd && p.hour === 0 && p.minute === 0) return d;
  }
  return guess;
}

export function isPeakSlot(start: Date, cfg: AgileFormulaConfig = DEFAULT_AGILE_FORMULA): boolean {
  const h = ukMinutes(start) / 60;
  return h >= cfg.peakStartHour && h < cfg.peakEndHour;
}

/**
 * Wholesale price (p/kWh ex VAT) -> Agile unit rate (p/kWh inc VAT),
 * with peak adder, VAT, cap and floor applied.
 */
export function agilePriceFromWholesale(
  wholesalePencePerKwh: number,
  slotStart: Date,
  cfg: AgileFormulaConfig = DEFAULT_AGILE_FORMULA,
): number {
  const peak = isPeakSlot(slotStart, cfg) ? cfg.peakAdder : 0;
  const raw = (wholesalePencePerKwh * cfg.multiplier + peak) * cfg.vatFactor;
  return Math.min(cfg.cap, Math.max(cfg.floor, raw));
}

/** £/MWh -> p/kWh. */
export function poundsPerMwhToPencePerKwh(v: number): number {
  return v / 10;
}

export interface PriceSlot {
  valid_from: string;
  valid_to: string;
  value_inc_vat: number;
}

export function averagePrice(slots: { value_inc_vat: number }[]): number | null {
  if (!slots.length) return null;
  return slots.reduce((s, r) => s + r.value_inc_vat, 0) / slots.length;
}

/** Percentage change from `previous` to `next`; null when not computable. */
export function percentChange(previous: number | null | undefined, next: number | null | undefined): number | null {
  if (previous == null || next == null || !Number.isFinite(previous) || !Number.isFinite(next)) return null;
  if (previous === 0) return null;
  // Use |previous| so that moving from -2 to -1 reads as "up".
  return ((next - previous) / Math.abs(previous)) * 100;
}

export function negativeSlots<T extends { value_inc_vat: number }>(slots: T[]): T[] {
  return slots.filter((s) => s.value_inc_vat < 0);
}

/** Slots whose UK date equals `ymd`, sorted by start time. */
export function slotsForUkDate<T extends { valid_from: string }>(slots: T[], ymd: string): T[] {
  return slots
    .filter((s) => ukDate(new Date(s.valid_from)) === ymd)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
}

/** Cheapest contiguous window of `hours` hours (half-hourly slots). */
export function cheapestWindow<T extends PriceSlot>(slots: T[], hours: number): { start: string; end: string; average: number } | null {
  const n = Math.round(hours * 2);
  if (n < 1 || slots.length < n) return null;
  let best: { i: number; avg: number } | null = null;
  for (let i = 0; i + n <= slots.length; i++) {
    let contiguous = true;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      if (j > 0 && slots[i + j].valid_from !== slots[i + j - 1].valid_to) { contiguous = false; break; }
      sum += slots[i + j].value_inc_vat;
    }
    if (!contiguous) continue;
    const avg = sum / n;
    if (!best || avg < best.avg) best = { i, avg };
  }
  return best ? { start: slots[best.i].valid_from, end: slots[best.i + n - 1].valid_to, average: best.avg } : null;
}

// ---------------------------------------------------------------------------
// Notification windows & de-duplication (all in Europe/London)
// ---------------------------------------------------------------------------

export type NotificationType = "estimate_ready" | "official_released";

export interface NotificationWindow {
  /** Window start, UK minutes after midnight. */
  startMinutes: number;
  /** Window end (exclusive), UK minutes after midnight. */
  endMinutes: number;
}

export const NOTIFICATION_WINDOWS: Record<NotificationType, NotificationWindow> = {
  // Day-ahead auction closes ~11:00 UK; results publish ~11:30-11:42 UK.
  estimate_ready: { startMinutes: 11 * 60 + 30, endMinutes: 14 * 60 },
  official_released: { startMinutes: 16 * 60, endMinutes: 19 * 60 },
};

export function isWithinNotificationWindow(type: NotificationType, now: Date): boolean {
  const w = NOTIFICATION_WINDOWS[type];
  const m = ukMinutes(now);
  return m >= w.startMinutes && m < w.endMinutes;
}

/** The delivery day a notification refers to: tomorrow in UK time. */
export function notificationTargetDate(now: Date): string {
  return addDays(ukDate(now), 1);
}

export function notificationKey(type: NotificationType, region: string, targetDate: string): string {
  return `${type}:${region}:${targetDate}`;
}

/**
 * Decide whether to send now. Sends only inside the UK-time window, only once
 * data actually exists, and never twice for the same type/region/day.
 */
export function shouldSendNotification(opts: {
  type: NotificationType;
  now: Date;
  region: string;
  hasData: boolean;
  alreadySentKeys: Iterable<string>;
}): boolean {
  if (!opts.hasData) return false;
  if (!isWithinNotificationWindow(opts.type, opts.now)) return false;
  const key = notificationKey(opts.type, opts.region, notificationTargetDate(opts.now));
  for (const k of opts.alreadySentKeys) if (k === key) return false;
  return true;
}

function fmtPct(p: number): string {
  return `${Math.abs(p).toFixed(0)}%`;
}

/** Build push title/body from tomorrow's slots and today's average. */
export function buildNotificationMessage(opts: {
  type: NotificationType;
  tomorrow: { value_inc_vat: number }[];
  todayAverage: number | null;
}): { title: string; body: string } {
  const avg = averagePrice(opts.tomorrow);
  const pct = percentChange(opts.todayAverage, avg);
  const neg = negativeSlots(opts.tomorrow).length;
  const official = opts.type === "official_released";
  const title = official ? "Official Agile rates are out" : "Crystal Ball: tomorrow's Agile estimate";
  const parts: string[] = [];
  if (avg != null) {
    if (pct == null) parts.push(`Average ${avg.toFixed(1)}p/kWh.`);
    else if (Math.abs(pct) < 0.5) parts.push(`Average about the same as today (${avg.toFixed(1)}p).`);
    else parts.push(`Average ${pct > 0 ? "up" : "down"} ${fmtPct(pct)} vs today (${avg.toFixed(1)}p).`);
  }
  if (neg > 0) parts.push(`${neg} negative slot${neg > 1 ? "s" : ""} (${(neg / 2).toFixed(neg % 2 ? 1 : 0)}h) - get plugged in!`);
  if (!official) parts.push("Estimate only, not official.");
  return { title, body: parts.join(" ") };
}
