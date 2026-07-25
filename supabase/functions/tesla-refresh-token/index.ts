import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TESLA_TOKEN = "https://auth.tesla.com/oauth2/v3/token";

export async function refreshIfNeeded(
  supabase: ReturnType<typeof createClient>,
  deviceId: string,
): Promise<{ access_token: string; region: string } | null> {
  const { data: conn } = await supabase
    .from("tesla_connections").select("*").eq("device_id", deviceId).maybeSingle();
  if (!conn) return null;

  const expiresAt = new Date(conn.expires_at as string).getTime();
  const needsRefresh = expiresAt - Date.now() < 60_000;
  if (!needsRefresh) return { access_token: conn.access_token as string, region: (conn.region as string) ?? "eu" };

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: Deno.env.get("TESLA_CLIENT_ID")!,
    refresh_token: conn.refresh_token as string,
    scope: "openid offline_access vehicle_device_data",
  });
  const res = await fetch(TESLA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Refresh failed [${res.status}]: ${await res.text()}`);
  const tok = await res.json();

  const update: Record<string, unknown> = {
    access_token: tok.access_token,
    expires_at: new Date(Date.now() + (tok.expires_in ?? 28800) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (tok.refresh_token) update.refresh_token = tok.refresh_token;

  await supabase.from("tesla_connections").update(update).eq("device_id", deviceId);
  return { access_token: tok.access_token, region: (conn.region as string) ?? "eu" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { device_id } = await req.json();
    if (!device_id) throw new Error("device_id required");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const result = await refreshIfNeeded(supabase, device_id);
    if (!result) throw new Error("No Tesla connection for this device");
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
