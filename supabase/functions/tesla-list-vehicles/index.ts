import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";
const FLEET_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";

// deno-lint-ignore no-explicit-any
async function getValidAccessToken(supabase: any, deviceId: string) {
  const { data: conn, error } = await supabase
    .from("tesla_connections")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conn) return null;

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
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.device_id ?? "");
    const wake = Boolean(body.wake);

    if (!deviceId) {
      return json({ error: "device_id is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const accessToken = await getValidAccessToken(supabase, deviceId);
    if (!accessToken) return json({ connected: false, vehicles: [] });

    const listRes = await fetch(`${FLEET_BASE}/api/1/vehicles`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listText = await listRes.text();
    if (!listRes.ok) {
      console.error("Tesla vehicles list failed:", listRes.status, listText);
      return json({ connected: true, error: `Tesla API error (${listRes.status})`, vehicles: [] }, 502);
    }
    const list = JSON.parse(listText);

    const vehicles = [];
    for (const v of list.response ?? []) {
      let battery: number | null = null;
      let chargingState: string | null = null;
      let chargeLimit: number | null = null;
      let batteryRange: number | null = null;
      if (wake && (v.state === "offline" || v.state === "asleep")) {
  console.log(`Waking vehicle ${v.id}...`);

  await fetch(
    `${FLEET_BASE}/api/1/vehicles/${v.id}/wake_up`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  // Give the vehicle a chance to wake up
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
      try {
        const dRes = await fetch(
          `${FLEET_BASE}/api/1/vehicles/${v.id}/vehicle_data?endpoints=charge_state`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (dRes.ok) {
          const d = await dRes.json();
          const cs = d?.response?.charge_state ?? {};
          battery = cs.battery_level ?? null;
          chargingState = cs.charging_state ?? null;
          chargeLimit = cs.charge_limit_soc ?? null;
          batteryRange = cs.battery_range ?? null;
        } else {
          await dRes.text();
        }
      } catch (err) {
        console.error("vehicle_data error:", err);
      }
      vehicles.push({
        id: String(v.id),
        vin_last4: String(v.vin ?? "").slice(-4),
        display_name: v.display_name ?? "Tesla",
      state: v.state ?? null,
battery_level: battery,
battery_range: batteryRange,
charging_state: chargingState,
charge_limit_soc: chargeLimit,
      });
      }
    await supabase
      .from("tesla_connections")
      .update({ vehicles, updated_at: new Date().toISOString() })
      .eq("device_id", deviceId);

    return json({ connected: true, vehicles });
  } catch (e) {
    console.error("tesla-list-vehicles error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
