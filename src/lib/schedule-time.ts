/**
 * Tesla charge-schedule time semantics.
 *
 * Tesla stores schedule times as "minutes after local midnight" in the
 * vehicle's own local timezone, plus a days-of-week bitmask. It never stores a
 * UTC instant. All conversions here therefore go through Europe/London so a
 * user in another timezone (e.g. on holiday) still sends the time the car will
 * actually use at home.
 *
 * Pure functions only — no network, no React. Covered by schedule-time.test.ts.
 */
import { formatUK, UK_TIMEZONE } from "@/lib/timezone";

export { UK_TIMEZONE };

/** Tesla day bit order: Sunday = bit 0 … Saturday = bit 6. */
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const ALL_DAYS_MASK = 0b1111111;

/** Minutes after UK local midnight for a UTC instant / ISO string. */
export function ukMinutesAfterMidnight(value: Date | string): number {
  const h = Number(formatUK(value, "H"));
  const m = Number(formatUK(value, "m"));
  return h * 60 + m;
}

/** UK weekday index (0 = Sunday) for a UTC instant / ISO string. */
export function ukDayIndex(value: Date | string): number {
  return Number(formatUK(value, "i")) % 7; // date-fns "i": 1 = Monday … 7 = Sunday
}

/** Bitmask for a single UK day. */
export function dayMaskFor(value: Date | string): number {
  return 1 << ukDayIndex(value);
}

/** Bitmask from a list of day indexes (0 = Sunday). */
export function maskFromDays(days: number[]): number {
  return days.reduce((m, d) => m | (1 << (((d % 7) + 7) % 7)), 0);
}

/** Day indexes contained in a bitmask, Sunday first. */
export function daysFromMask(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => (mask & (1 << d)) !== 0);
}

/** "Mon, Tue, Wed" / "Every day" / "—" for display. */
export function formatDaysMask(mask: number): string {
  const days = daysFromMask(mask);
  if (days.length === 0) return "—";
  if (days.length === 7) return "Every day";
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

/** Minutes after midnight -> "HH:mm". Wraps safely past 24 h. */
export function minutesToClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:mm" -> minutes after midnight, or null when malformed. */
export function clockToMinutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** True when the window crosses midnight (finish is at or before the start). */
export function isOvernight(startMinutes: number, endMinutes: number | null | undefined): boolean {
  if (endMinutes === null || endMinutes === undefined) return false;
  return endMinutes <= startMinutes;
}

/**
 * The UK day a schedule finishes on, given the day it starts on.
 * Sunday start + overnight window rolls into Monday.
 */
export function endDayIndex(startDayIndex: number, startMinutes: number, endMinutes: number | null): number {
  if (!isOvernight(startMinutes, endMinutes)) return startDayIndex;
  return (startDayIndex + 1) % 7;
}

export interface SchedulePayloadInput {
  startMinutes: number;
  endMinutes: number | null;
  daysMask: number;
  oneTime: boolean;
  lat?: number | null;
  lon?: number | null;
  scheduleId?: number | null;
}

/**
 * Exact Tesla `add_charge_schedule` body. Kept pure so the dry-run preview and
 * the live command are guaranteed to send byte-identical payloads.
 */
export function buildAddSchedulePayload(input: SchedulePayloadInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    days_of_week: input.daysMask,
    enabled: true,
    one_time: input.oneTime,
    start_enabled: true,
    start_time: Math.round(input.startMinutes),
    end_enabled: input.endMinutes !== null && input.endMinutes !== undefined,
    end_time: input.endMinutes ?? 0,
  };
  if (typeof input.lat === "number" && typeof input.lon === "number") {
    payload.lat = input.lat;
    payload.lon = input.lon;
  }
  if (input.scheduleId) payload.id = input.scheduleId;
  return payload;
}

/** Does the schedule Tesla returned match what we asked for? */
export function scheduleMatches(
  requested: SchedulePayloadInput,
  actual: { start_time?: number | null; end_time?: number | null; days_of_week?: number | null; enabled?: boolean | null; end_enabled?: boolean | null } | null,
): boolean {
  if (!actual) return false;
  if (actual.enabled === false) return false;
  if (Math.round(requested.startMinutes) !== Number(actual.start_time)) return false;
  if (Number(requested.daysMask) !== Number(actual.days_of_week)) return false;
  const wantEnd = requested.endMinutes !== null && requested.endMinutes !== undefined;
  if (wantEnd !== Boolean(actual.end_enabled)) return false;
  if (wantEnd && Math.round(requested.endMinutes as number) !== Number(actual.end_time)) return false;
  return true;
}
