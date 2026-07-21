import { formatInTimeZone } from "date-fns-tz";

export const UK_TIMEZONE = "Europe/London";

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
