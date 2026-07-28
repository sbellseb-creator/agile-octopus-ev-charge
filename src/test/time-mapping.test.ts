import { describe, expect, it } from "vitest";
import { isoToUkClock, isClockTime, ukClockToIso } from "@/lib/timezone";

describe("clock time <-> timestamptz mapping", () => {
  it("detects bare clock times", () => {
    expect(isClockTime("14:00")).toBe(true);
    expect(isClockTime("07:15:30")).toBe(true);
    expect(isClockTime("2026-07-28T13:00:00Z")).toBe(false);
  });

  it("combines a session date and UK clock time into ISO-8601 (BST)", () => {
    // 14:00 UK in July = 13:00 UTC
    expect(ukClockToIso("2026-07-28", "14:00")).toBe("2026-07-28T13:00:00.000Z");
    // 14:00 UK in January = 14:00 UTC
    expect(ukClockToIso("2026-01-28", "14:00")).toBe("2026-01-28T14:00:00.000Z");
  });

  it("passes through existing timestamps and rejects junk", () => {
    expect(ukClockToIso("2026-07-28", "2026-07-28T13:00:00.000Z")).toBe("2026-07-28T13:00:00.000Z");
    expect(ukClockToIso("2026-07-28", undefined)).toBeNull();
    expect(ukClockToIso("2026-07-28", "not-a-time")).toBeNull();
  });

  it("renders timestamps back as UK clock times", () => {
    expect(isoToUkClock("2026-07-28T13:00:00.000Z")).toBe("14:00");
    expect(isoToUkClock("18:30")).toBe("18:30");
    expect(isoToUkClock(null)).toBeUndefined();
  });
});
