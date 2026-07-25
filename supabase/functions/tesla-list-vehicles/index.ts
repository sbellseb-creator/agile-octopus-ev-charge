import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { refreshIfNeeded } from "../tesla-refresh-token/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FLEET_BASE: Record<string, string> = {
  eu: "https://fleet-api.prd.eu.vn.cloud.tesla.com",
  na: "https://fleet-api.prd.na.vn.cloud.tesla.com",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { device_id } = await req.json();
    if (!device_id) throw new Error("device_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tokenInfo = await refreshIfNeeded(supabase, device_id);
    if (!tokenInfo) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = FLEET_BASE[tokenInfo.region] ?? FLEET_BASE.eu;
    const auth = { Authorization: `Bearer ${tokenInfo.access_token}` };

    const listRes = await fetch(`${base}/api/1/vehicles`, { headers: auth });
    if (!listRes.ok) throw new Error(`vehicles list [${listRes.status}]: ${await listRes.text()}`);
    const listJson = await listRes.json();
    const rawVehicles: Array<Record<string, unknown>> = listJson.response ?? [];

    const enriched = await Promise.all(rawVehicles.map(async (v) => {
      const vin = String(v.vin ?? "");
      const id = v.id ?? v.id_s;
      let charge: Record<string, unknown> | null = null;
      let online = v.state === "online";
      try {
        const dataRes = await fetch(
          `${base}/api/1/vehicles/${id}/vehicle_data?endpoints=charge_state`,
          { headers: auth },
        );
        if (dataRes.ok) {
          const dj = await dataRes.json();
          charge = dj.response?.charge_state ?? null;
        } else if (dataRes.status === 408) {
          online = false; // asleep
        }
      } catch { /* ignore per-vehicle */ }

      return {
        id: String(id),
        name: v.display_name ?? "Tesla",
        vin_last4: vin.slice(-4),
        state: v.state ?? "unknown",
        online,
        battery_level: charge?.battery_level ?? null,
        charging_state: charge?.charging_state ?? null,
        charge_limit_soc: charge?.charge_limit_soc ?? null,
      };
    }));

    await supabase.from("tesla_connections").update({
      vehicles: enriched, updated_at: new Date().toISOString(),
    }).eq("device_id", device_id);

    return new Response(JSON.stringify({ connected: true, vehicles: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("tesla-list-vehicles:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
