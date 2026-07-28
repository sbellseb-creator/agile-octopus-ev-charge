import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getAuthedUserId, logEvent, safeMessage, serviceClient } from "../_shared/auth.ts";

const AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";

/**
 * Shared token helper. `conn` is the tesla_connections row for the owning user.
 * Refreshes only when the access token is close to expiry.
 */
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

const FN = "tesla-refresh-token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const userId = await getAuthedUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    const conn = await getConnection(supabase, userId);
    if (!conn) return json({ connected: false });

    await getValidAccessToken(supabase, conn);
    logEvent(FN, "token_ok", { userId });
    return json({ connected: true });
  } catch (e) {
    logEvent(FN, "unhandled_error", { message: safeMessage(e) }, "error");
    return json({ error: safeMessage(e) }, 500);
  }
});
