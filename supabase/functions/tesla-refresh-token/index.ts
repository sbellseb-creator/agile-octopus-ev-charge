import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";

export async function getValidAccessToken(supabase: ReturnType<typeof createClient>, deviceId: string) {
  const { data: conn, error } = await supabase
    .from("tesla_connections")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conn) return null;

  const expiresAt = new Date(conn.expires_at as string).getTime();
  if (expiresAt - Date.now() > 120_000) return conn.access_token as string;

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: Deno.env.get("TESLA_CLIENT_ID")!,
      refresh_token: conn.refresh_token as string,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Tesla refresh failed:", res.status, text);
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
    .eq("device_id", deviceId);
  return token.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.device_id ?? "");
    if (!deviceId) {
      return new Response(JSON.stringify({ error: "device_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = await getValidAccessToken(supabase, deviceId);
    return new Response(JSON.stringify({ connected: Boolean(token) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tesla-refresh-token error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
