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
    let detail = "";
    try {
      const j = JSON.parse(text);
      detail = String(j.error_description ?? j.error ?? "").slice(0, 200);
    } catch {
      detail = text.slice(0, 200);
    }
    logEvent("tesla-token", "refresh_failed", { status: res.status, detail }, "error");
    throw new Error(`Tesla token refresh failed (${res.status}): ${detail || "no detail returned"}`);
  }
  const token = JSON.parse(text);
  const granted = String(token.scope ?? "").split(" ").filter(Boolean);
  await supabase
    .from("tesla_connections")
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? conn.refresh_token,
      expires_at: new Date(Date.now() + (Number(token.expires_in) || 28800) * 1000).toISOString(),
      ...(granted.length ? { scopes: granted } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("device_id", conn.device_id);
  return token.access_token as string;
}

/** Scopes actually present on a Fleet API access token (scp claim). */
export function tokenScopes(accessToken: string): string[] {
  try {
    const part = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
    return Array.isArray(claims?.scp) ? (claims.scp as string[]) : [];
  } catch {
    return [];
  }
}
