import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getAuthedUserId, logEvent, safeMessage, serviceClient } from "../_shared/auth.ts";
import { evaluateRateLimit, getConnection, getValidAccessToken } from "../_shared/tesla.ts";

const FLEET_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";
const FN = "tesla-list-vehicles";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const userId = await getAuthedUserId(req);
    if (!userId) {
      logEvent(FN, "unauthorized", {}, "warn");
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    // wake is opt-in only: absent/false means never call wake_up.
    const wakeRequested = body.wake === true;

    const supabase = serviceClient();
    const conn = await getConnection(supabase, userId);
    if (!conn) return json({ connected: false, vehicles: [] });

    const now = Date.now();
    const { allowPoll, allowWake, retryAfterMs } = evaluateRateLimit({
      wakeRequested,
      lastWakeAt: conn.last_wake_at ?? null,
      lastPollAt: conn.last_poll_at ?? null,
      now,
    });

    if (!allowPoll && !wakeRequested) {
      // Serve the cached vehicle snapshot rather than hammering Tesla.
      logEvent(FN, "poll_throttled_cached", { userId, retryAfterMs });
      return json({ connected: true, vehicles: conn.vehicles ?? [], cached: true, last_updated: conn.updated_at });
    }
    if (wakeRequested && !allowWake) {
      logEvent(FN, "wake_rate_limited", { userId, retryAfterMs }, "warn");
      return json(
        {
          connected: true,
          vehicles: conn.vehicles ?? [],
          cached: true,
          last_updated: conn.updated_at,
          error: `Refresh is rate limited. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
        },
        429,
      );
    }

    const accessToken = await getValidAccessToken(supabase, conn);

    await supabase
      .from("tesla_connections")
      .update({ last_poll_at: new Date(now).toISOString(), ...(allowWake ? { last_wake_at: new Date(now).toISOString() } : {}) })
      .eq("device_id", conn.device_id);

    const listRes = await fetch(`${FLEET_BASE}/api/1/vehicles`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listText = await listRes.text();
    if (!listRes.ok) {
      logEvent(FN, "list_failed", { userId, status: listRes.status }, "error");
      return json({ connected: true, error: `Tesla API error (${listRes.status})`, vehicles: conn.vehicles ?? [] }, 502);
    }
    const list = JSON.parse(listText);

    const vehicles = [];
    for (const v of list.response ?? []) {
      let battery: number | null = null;
      let chargingState: string | null = null;
      let chargeLimit: number | null = null;

      // Only wake the car on an explicit, rate-limit-approved manual refresh.
      if (allowWake && v.state !== "online") {
        try {
          const wRes = await fetch(`${FLEET_BASE}/api/1/vehicles/${v.id}/wake_up`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const wText = await wRes.text();
          if (!wRes.ok) {
            void wText;
            logEvent(FN, "wake_failed", { userId, status: wRes.status }, "warn");
          } else {
            logEvent(FN, "wake_requested", { userId });
            for (let i = 0; i < 5; i++) {
              await new Promise((r) => setTimeout(r, 2000));
              const sRes = await fetch(`${FLEET_BASE}/api/1/vehicles/${v.id}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (!sRes.ok) { await sRes.text(); break; }
              const s = await sRes.json();
              if (s?.response?.state === "online") { v.state = "online"; break; }
            }
          }
        } catch (err) {
          logEvent(FN, "wake_error", { userId, message: safeMessage(err) }, "warn");
        }
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
        } else {
          await dRes.text();
        }
      } catch (err) {
        logEvent(FN, "vehicle_data_error", { userId, message: safeMessage(err) }, "warn");
      }
      vehicles.push({
        id: String(v.id),
        vin_last4: String(v.vin ?? "").slice(-4),
        display_name: v.display_name ?? "Tesla",
        state: v.state ?? null,
        battery_level: battery,
        charging_state: chargingState,
        charge_limit_soc: chargeLimit,
      });
    }

    const updatedAt = new Date().toISOString();
    await supabase
      .from("tesla_connections")
      .update({ vehicles, updated_at: updatedAt })
      .eq("device_id", conn.device_id);

    logEvent(FN, "listed", { userId, count: vehicles.length, woke: allowWake });
    return json({ connected: true, vehicles, cached: false, last_updated: updatedAt });
  } catch (e) {
    logEvent(FN, "unhandled_error", { message: safeMessage(e) }, "error");
    return json({ error: safeMessage(e) }, 500);
  }
});
