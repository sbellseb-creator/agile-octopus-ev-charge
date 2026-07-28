/**
 * Tesla charging-schedule commands (Fleet API).
 *
 * Endpoints used:
 *   POST /api/1/vehicles/{id}/command/add_charge_schedule
 *   POST /api/1/vehicles/{id}/command/remove_charge_schedule
 *   POST /api/1/vehicles/{id}/command/set_charge_limit
 *   GET  /api/1/vehicles/{id}/vehicle_data?endpoints=charge_schedule_data
 *
 * The legacy set_scheduled_charging endpoint is deliberately NOT used.
 *
 * SAFETY RULES ENFORCED HERE
 *  - "read" never wakes the car (wake=false semantics preserved).
 *  - "dry_run" never contacts the vehicle at all: it returns the exact payload.
 *  - Waking is only attempted for a command action with confirmed === true.
 *  - Nothing in this function is ever invoked on a timer or on page load.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getAuthedUserId, logEvent, safeMessage, serviceClient } from "../_shared/auth.ts";
import { getConnection, getValidAccessToken } from "../_shared/tesla.ts";
import { buildAddSchedulePayload, explainTeslaFailure } from "../_shared/schedule.ts";

const FLEET_BASE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";
const FN = "tesla-charge-schedule";

/**
 * Signed Vehicle Command Protocol. Most vehicles (all Model 3/Y and 2021+ S/X)
 * require commands to be signed, which means routing them through a Tesla
 * HTTP Proxy holding the application's private key. When TESLA_COMMAND_PROXY_URL
 * is configured we send commands there; otherwise we call the Fleet API
 * directly and surface Tesla's "signed command required" response verbatim.
 */
function commandBase(): { base: string; signed: boolean } {
  const proxy = Deno.env.get("TESLA_COMMAND_PROXY_URL");
  if (proxy) return { base: proxy.replace(/\/+$/, ""), signed: true };
  return { base: FLEET_BASE, signed: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const userId = await getAuthedUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const vehicleId = String(body.tesla_vehicle_id ?? "");
    const confirmed = body.confirmed === true;

    const startMinutes = Number(body.start_minutes);
    const endMinutesRaw = body.end_minutes;
    const endMinutes = endMinutesRaw === null || endMinutesRaw === undefined ? null : Number(endMinutesRaw);
    const daysMask = Number(body.days_mask ?? 0);
    const oneTime = body.one_time !== false;
    const scheduleId = body.tesla_schedule_id ? Number(body.tesla_schedule_id) : null;
    const chargeLimit = body.charge_limit_soc === undefined || body.charge_limit_soc === null ? null : Number(body.charge_limit_soc);

    const { base, signed } = commandBase();

    // ---- Dry run: never touches the network. -------------------------------
    if (action === "dry_run") {
      const payload = buildAddSchedulePayload({ startMinutes, endMinutes, daysMask, oneTime, lat: body.lat, lon: body.lon, scheduleId });
      return json({
        dry_run: true,
        signed_path: signed,
        endpoint: `POST ${base}/api/1/vehicles/${vehicleId || "{vehicle_id}"}/command/add_charge_schedule`,
        payload,
        charge_limit_command: chargeLimit === null
          ? null
          : { endpoint: `POST ${base}/api/1/vehicles/${vehicleId || "{vehicle_id}"}/command/set_charge_limit`, payload: { percent: chargeLimit } },
        wakes_vehicle: false,
      });
    }

    const supabase = serviceClient();
    const conn = await getConnection(supabase, userId);
    if (!conn) return json({ error: "No Tesla account is connected.", code: "not_connected" }, 400);
    if (!vehicleId) return json({ error: "tesla_vehicle_id is required" }, 400);

    const accessToken = await getValidAccessToken(supabase, conn);
    const authHeaders = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    /** Read charge_schedule_data. Never wakes the vehicle. */
    const readSchedules = async () => {
      const res = await fetch(
        `${FLEET_BASE}/api/1/vehicles/${vehicleId}/vehicle_data?endpoints=charge_schedule_data`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const text = await res.text();
      if (!res.ok) return { ok: false as const, status: res.status, ...explainTeslaFailure(res.status, text) };
      const parsed = JSON.parse(text);
      const raw = parsed?.response?.charge_schedule_data ?? parsed?.response ?? {};
      const list = raw.charge_schedules ?? raw.schedules ?? [];
      return { ok: true as const, schedules: Array.isArray(list) ? list : [] };
    };

    if (action === "read") {
      const r = await readSchedules();
      logEvent(FN, "read", { userId, ok: r.ok });
      return r.ok ? json({ schedules: r.schedules }) : json({ error: r.message, code: r.code }, 200);
    }

    // ---- Everything past this point is an explicit vehicle command. --------
    if (!confirmed) {
      return json({ error: "This action requires explicit user confirmation.", code: "not_confirmed" }, 400);
    }

    /** Wake, only ever from a confirmed command. Single attempt, no retry loop. */
    const ensureAwake = async () => {
      const sRes = await fetch(`${FLEET_BASE}/api/1/vehicles/${vehicleId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const sText = await sRes.text();
      if (sRes.ok && JSON.parse(sText)?.response?.state === "online") return { woke: false, online: true };
      const wRes = await fetch(`${FLEET_BASE}/api/1/vehicles/${vehicleId}/wake_up`, { method: "POST", headers: authHeaders });
      await wRes.text();
      if (!wRes.ok) return { woke: true, online: false };
      await supabase.from("tesla_connections").update({ last_wake_at: new Date().toISOString() }).eq("device_id", conn.device_id);
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const pRes = await fetch(`${FLEET_BASE}/api/1/vehicles/${vehicleId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const pText = await pRes.text();
        if (pRes.ok && JSON.parse(pText)?.response?.state === "online") return { woke: true, online: true };
      }
      return { woke: true, online: false };
    };

    const sendCommand = async (name: string, payload: Record<string, unknown>) => {
      const res = await fetch(`${base}/api/1/vehicles/${vehicleId}/command/${name}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false as const, ...explainTeslaFailure(res.status, text) };
      const parsed = JSON.parse(text || "{}");
      const result = parsed?.response;
      if (result && result.result === false) {
        return { ok: false as const, ...explainTeslaFailure(200, JSON.stringify(result)), message: String(result.reason || "Tesla rejected the command.") };
      }
      return { ok: true as const, response: result ?? {} };
    };

    const awake = await ensureAwake();
    if (!awake.online) {
      logEvent(FN, "wake_failed", { userId, action }, "warn");
      return json({ error: "The vehicle did not come online. It may be asleep, offline or out of signal. Try again from the Send button.", code: "wake_failed" }, 200);
    }

    if (action === "set_charge_limit") {
      if (chargeLimit === null || chargeLimit < 50 || chargeLimit > 100) return json({ error: "charge_limit_soc must be 50–100" }, 400);
      const r = await sendCommand("set_charge_limit", { percent: Math.round(chargeLimit) });
      logEvent(FN, "set_charge_limit", { userId, ok: r.ok });
      return r.ok ? json({ ok: true }) : json({ error: r.message, code: r.code }, 200);
    }

    if (action === "remove") {
      if (!scheduleId) return json({ error: "tesla_schedule_id is required to remove a schedule." }, 400);
      const r = await sendCommand("remove_charge_schedule", { id: scheduleId });
      if (!r.ok) return json({ error: r.message, code: r.code }, 200);
      const after = await readSchedules();
      const stillThere = after.ok && after.schedules.some((s: Record<string, unknown>) => Number(s.id) === scheduleId);
      logEvent(FN, "removed", { userId, verified: !stillThere });
      return json({ ok: true, verified: !stillThere, schedules: after.ok ? after.schedules : [] });
    }

    if (action === "add" || action === "replace") {
      if (!Number.isFinite(startMinutes)) return json({ error: "start_minutes is required" }, 400);

      // Replace only ever removes a schedule this app created and recorded.
      if (action === "replace" && scheduleId) {
        const prior = await sendCommand("remove_charge_schedule", { id: scheduleId });
        if (!prior.ok) logEvent(FN, "replace_remove_failed", { userId, code: prior.code }, "warn");
      }

      const before = await readSchedules();
      const beforeIds = new Set((before.ok ? before.schedules : []).map((s: Record<string, unknown>) => Number(s.id)));

      const payload = buildAddSchedulePayload({ startMinutes, endMinutes, daysMask, oneTime, lat: body.lat, lon: body.lon });
      const r = await sendCommand("add_charge_schedule", payload);
      if (!r.ok) return json({ error: r.message, code: r.code, payload }, 200);

      // Tesla returns the assigned id in the command response on most firmware.
      let newId: number | null = Number(r.response?.id ?? r.response?.result?.id ?? NaN);
      if (!Number.isFinite(newId as number)) newId = null;

      const after = await readSchedules();
      if (!after.ok) {
        return json({ ok: true, verified: false, tesla_schedule_id: newId, payload, verify_error: after.message });
      }
      const match = after.schedules.find((s: Record<string, unknown>) =>
        newId !== null ? Number(s.id) === newId : !beforeIds.has(Number(s.id))
      ) ?? null;
      if (match && newId === null) newId = Number(match.id);

      logEvent(FN, "added", { userId, verified: Boolean(match), signed });
      return json({ ok: true, tesla_schedule_id: newId, verified: Boolean(match), schedule: match, schedules: after.schedules, payload });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (e) {
    logEvent(FN, "unhandled_error", { message: safeMessage(e) }, "error");
    return json({ error: safeMessage(e) }, 500);
  }
});
