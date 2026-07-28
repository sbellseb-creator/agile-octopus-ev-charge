import { describe, expect, it } from "vitest";
import {
  evaluateRateLimit,
  POLL_MIN_INTERVAL_MS,
  WAKE_MIN_INTERVAL_MS,
} from "../../supabase/functions/_shared/rate-limit";

const NOW = Date.parse("2026-07-28T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("Tesla rate limiting / wake safety", () => {
  it("never allows a wake when one was not requested, even after a long idle", () => {
    const r = evaluateRateLimit({ wakeRequested: false, lastWakeAt: null, lastPollAt: null, now: NOW });
    expect(r.allowWake).toBe(false);
    expect(r.allowPoll).toBe(true);
  });

  it("allows a wake on first explicit manual refresh", () => {
    const r = evaluateRateLimit({ wakeRequested: true, lastWakeAt: null, lastPollAt: null, now: NOW });
    expect(r.allowWake).toBe(true);
  });

  it("blocks repeated wakes inside the minimum interval", () => {
    const r = evaluateRateLimit({ wakeRequested: true, lastWakeAt: ago(60_000), lastPollAt: null, now: NOW });
    expect(r.allowWake).toBe(false);
    expect(r.retryAfterMs).toBe(WAKE_MIN_INTERVAL_MS - 60_000);
  });

  it("allows a wake again once the interval has elapsed", () => {
    const r = evaluateRateLimit({
      wakeRequested: true,
      lastWakeAt: ago(WAKE_MIN_INTERVAL_MS + 1),
      lastPollAt: null,
      now: NOW,
    });
    expect(r.allowWake).toBe(true);
  });

  it("throttles rapid non-waking polls", () => {
    const r = evaluateRateLimit({ wakeRequested: false, lastWakeAt: null, lastPollAt: ago(1_000), now: NOW });
    expect(r.allowPoll).toBe(false);
    expect(r.retryAfterMs).toBe(POLL_MIN_INTERVAL_MS - 1_000);
  });

  it("navigating repeatedly (many polls) still never permits a wake", () => {
    for (let i = 0; i < 20; i++) {
      const r = evaluateRateLimit({ wakeRequested: false, lastWakeAt: ago(i * 1000), lastPollAt: ago(i * 1000), now: NOW });
      expect(r.allowWake).toBe(false);
    }
  });
});
