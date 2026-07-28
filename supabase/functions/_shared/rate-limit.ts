/**
 * Pure, dependency-free rate-limit rules for Tesla requests.
 * Kept free of Deno/npm imports so it can be unit tested from the app suite.
 */

/** Minimum gap between wake requests for one connection. */
export const WAKE_MIN_INTERVAL_MS = 5 * 60_000;
/** Minimum gap between (non-waking) polls for one connection. */
export const POLL_MIN_INTERVAL_MS = 15_000;

export function evaluateRateLimit(opts: {
  wakeRequested: boolean;
  lastWakeAt: string | null;
  lastPollAt: string | null;
  now: number;
}): { allowPoll: boolean; allowWake: boolean; retryAfterMs: number } {
  const { wakeRequested, lastWakeAt, lastPollAt, now } = opts;
  const sinceWake = lastWakeAt ? now - new Date(lastWakeAt).getTime() : Infinity;
  const sincePoll = lastPollAt ? now - new Date(lastPollAt).getTime() : Infinity;

  const allowPoll = sincePoll >= POLL_MIN_INTERVAL_MS;
  // Never wake unless explicitly requested — app load and navigation must not wake the car.
  const allowWake = wakeRequested && sinceWake >= WAKE_MIN_INTERVAL_MS;
  const retryAfterMs =
    wakeRequested && !allowWake && Number.isFinite(sinceWake)
      ? Math.max(0, WAKE_MIN_INTERVAL_MS - sinceWake)
      : Math.max(0, POLL_MIN_INTERVAL_MS - (Number.isFinite(sincePoll) ? sincePoll : POLL_MIN_INTERVAL_MS));

  return { allowPoll, allowWake, retryAfterMs };
}
