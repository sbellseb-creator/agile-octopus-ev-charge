import { formatInTimeZone, fromZonedTime } from "date-tz-placeholder";

export const UK_TIMEZONE = "Europe/London";

/** True when a value is a bare clock time such as "14:00" or "07:15:30". */
export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value);
}

/**
 * Convert a `YYYY-MM-DD` date plus an `HH:mm` clock time (UK local) into a
 * full ISO-8601 timestamp suitable for a timestamptz column.
 * Returns null when either part is missing/invalid.
 */
export function ukClockToIso(dateStr?: string | null, timeStr?: string | null): string | null {
  if (!dateStr || !timeStr) return null;
  if (!isClockTime(timeStr)) {
    const d = new Date(timeStr);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [h, mi] = timeStr.split(":").map(Number);
  if ([h, mi].some((n) => Number.isNaN(n))) return null;
  const iso = `${dateStr}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
  const d = fromZonedTime(iso, UK_TIMEZONE);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Timestamp (or clock time) -> `HH:mm` UK clock time for the local model.
 * Existing localStorage values that are already "HH:mm" pass straight through.
 */
export function isoToUkClock(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (isClockTime(value)) return value.slice(0, 5);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return formatInTimeZone(d, UK_TIMEZONE, "HH:mm");
}


/** Format a UTC date/string as UK local time. Drop-in replacement for date-fns `format`. */
export function formatUK(date: Date | string, formatStr: string): string {
  return formatInTimeZone(date, UK_TIMEZONE, formatStr);
}

/** Return a UK day key like "2026-07-12" (ISO date) for grouping slots. */
export function getUKDayKey(date: Date | string): string {
  return formatUK(date, "yyyy-MM-dd");
}

/** Return the UK local hour (0-23) for a UTC date/string. */
export function getUKHour(date: Date | string): number {
  return parseInt(formatUK(date, "H"), 10);
}

/** Current instant as a Date (still UTC under the hood, but use formatUK to render it). */
export function getUKNow(): Date {
  return new Date();
}

/** Check whether two UTC dates fall on the same UK day. */
export function isSameUKDay(a: Date | string, b: Date | string): boolean {
  return getUKDayKey(a) === getUKDayKey(b);
}
