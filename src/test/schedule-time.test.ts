import { describe, expect, it } from "vitest";
import {
  buildAddSchedulePayload,
  clockToMinutes,
  dayMaskFor,
  daysFromMask,
  endDayIndex,
  formatDaysMask,
  isOvernight,
  maskFromDays,
  minutesToClock,
  scheduleMatches,
  ukDayIndex,
  ukMinutesAfterMidnight,
} from "@/lib/schedule-time";

describe("Tesla schedule time semantics (Europe/London)", () => {
  it("summer BST: 02:30 UK is 01:30 UTC and still means 150 minutes", () => {
    expect(ukMinutesAfterMidnight("2026-07-15T01:30:00.000Z")).toBe(150);
  });

  it("winter GMT: 02:30 UK is 02:30 UTC and still means 150 minutes", () => {
    expect(ukMinutesAfterMidnight("2026-01-15T02:30:00.000Z")).toBe(150);
  });

  it("no UTC shift for a late-evening BST start", () => {
    // 23:30 UK on 15 July = 22:30 UTC
    expect(ukMinutesAfterMidnight("2026-07-15T22:30:00.000Z")).toBe(23 * 60 + 30);
    expect(ukDayIndex("2026-07-15T22:30:00.000Z")).toBe(3); // Wednesday
  });

  it("handles the spring-forward transition (29 Mar 2026, 01:00 UTC)", () => {
    // 00:30 UTC = 00:30 GMT (before the jump)
    expect(ukMinutesAfterMidnight("2026-03-29T00:30:00.000Z")).toBe(30);
    // 01:30 UTC = 02:30 BST (after the jump) — clocks skipped 01:00–02:00
    expect(ukMinutesAfterMidnight("2026-03-29T01:30:00.000Z")).toBe(150);
  });

  it("handles the autumn fall-back transition (25 Oct 2026, 02:00 UTC)", () => {
    // 00:30 UTC = 01:30 BST
    expect(ukMinutesAfterMidnight("2026-10-25T00:30:00.000Z")).toBe(90);
    // 02:30 UTC = 02:30 GMT
    expect(ukMinutesAfterMidnight("2026-10-25T02:30:00.000Z")).toBe(150);
  });

  it("detects overnight windows and rolls Sunday into Monday", () => {
    expect(isOvernight(23 * 60 + 30, 5 * 60 + 30)).toBe(true);
    expect(isOvernight(1 * 60, 5 * 60)).toBe(false);
    expect(isOvernight(60, null)).toBe(false);
    // Sunday (0) 23:30 -> 05:30 finishes on Monday (1)
    expect(endDayIndex(0, 23 * 60 + 30, 5 * 60 + 30)).toBe(1);
    // Saturday (6) overnight wraps to Sunday (0)
    expect(endDayIndex(6, 23 * 60, 6 * 60)).toBe(0);
    // Same-day window keeps the day
    expect(endDayIndex(3, 60, 300)).toBe(3);
  });

  it("maps UK days to Tesla's Sunday-first bitmask", () => {
    expect(ukDayIndex("2026-07-19T12:00:00.000Z")).toBe(0); // Sunday
    expect(dayMaskFor("2026-07-19T12:00:00.000Z")).toBe(1);
    expect(dayMaskFor("2026-07-20T12:00:00.000Z")).toBe(2); // Monday
    expect(maskFromDays([1, 2, 3, 4, 5])).toBe(0b0111110);
    expect(daysFromMask(0b0111110)).toEqual([1, 2, 3, 4, 5]);
    expect(formatDaysMask(0b1111111)).toBe("Every day");
    expect(formatDaysMask(0)).toBe("—");
    expect(formatDaysMask(0b0000011)).toBe("Sun, Mon");
  });

  it("round-trips clock times", () => {
    expect(minutesToClock(150)).toBe("02:30");
    expect(minutesToClock(0)).toBe("00:00");
    expect(minutesToClock(1440)).toBe("00:00");
    expect(clockToMinutes("23:30")).toBe(1410);
    expect(clockToMinutes("nope")).toBeNull();
    expect(clockToMinutes("25:00")).toBeNull();
  });

  it("builds the exact Tesla payload", () => {
    expect(
      buildAddSchedulePayload({ startMinutes: 1410, endMinutes: 330, daysMask: 2, oneTime: true, lat: 54.9, lon: -1.6 }),
    ).toEqual({
      days_of_week: 2,
      enabled: true,
      one_time: true,
      start_enabled: true,
      start_time: 1410,
      end_enabled: true,
      end_time: 330,
      lat: 54.9,
      lon: -1.6,
    });
  });

  it("omits the end time when no ready-by is requested", () => {
    const p = buildAddSchedulePayload({ startMinutes: 60, endMinutes: null, daysMask: 4, oneTime: false });
    expect(p.end_enabled).toBe(false);
    expect(p.lat).toBeUndefined();
  });

  it("verifies read-back agreement", () => {
    const req = { startMinutes: 1410, endMinutes: 330, daysMask: 2, oneTime: true };
    expect(scheduleMatches(req, { start_time: 1410, end_time: 330, days_of_week: 2, enabled: true, end_enabled: true })).toBe(true);
    expect(scheduleMatches(req, { start_time: 1400, end_time: 330, days_of_week: 2, enabled: true, end_enabled: true })).toBe(false);
    expect(scheduleMatches(req, { start_time: 1410, end_time: 330, days_of_week: 2, enabled: false, end_enabled: true })).toBe(false);
    expect(scheduleMatches(req, null)).toBe(false);
  });
});
