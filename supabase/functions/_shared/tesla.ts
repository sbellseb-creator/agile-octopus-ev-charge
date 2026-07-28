import { logEvent } from "./auth.ts";

export { evaluateRateLimit, POLL_MIN_INTERVAL_MS, WAKE_MIN_INTERVAL_MS } from "./rate-limit.ts";

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
    void text;
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
