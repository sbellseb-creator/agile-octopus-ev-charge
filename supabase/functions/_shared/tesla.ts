import { logEvent } from "./auth.ts";

const AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";

/** Look up the Tesla connection owned by the authenticated user. */
// deno-lint-ignore no-explicit-any
export async function getConnection(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("tesla_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Returns a valid access token for the connection, refreshing only near expiry. */
// deno-lint-ignore no-explicit-any
export async function getValidAccessToken(supabase: any, conn: any): Promise<string> {
  if (new Date(conn.expires_at).getTime() - Date.now() > 120_000) return conn.access_token as string;

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("TESLA_CLIENT_ID")!,
      refresh_token: conn.refresh_token,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    logEvent("tesla-token", "refresh_failed", { status: res.status }, "error");
    throw new Error(`Tesla token refresh failed (${res.status})`);
  }
  const token = JSON.parse(text);
  await supabase
    .from("tesla_connections")
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? conn.refresh_token,
      expires_at: new Date(Date.now() + (Number(token.expires_in) || 28800) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("device_id", conn.device_id);
  return token.access_token as string;
}

/** Minimum gap between wake requests for one connection. */
export const WAKE_MIN_INTERVAL_MS = 5 * 60_000;
/** Minimum gap between (non-waking) polls for one connection. */
export const POLL_MIN_INTERVAL_MS = 15_000;

/**
 * Pure rate-limit decision so it can be unit tested without a database.
 * A wake is only ever permitted when the caller explicitly requested one.
 */
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
  const retryAfterMs = wakeRequested && !allowWake && sinceWake !== Infinity
    ? Math.max(0, WAKE_MIN_INTERVAL_MS - sinceWake)
    : Math.max(0, POLL_MIN_INTERVAL_MS - sincePoll);

  return { allowPoll, allowWake, retryAfterMs };
}
