/**
 * App-side charge-schedule store + Tesla command client.
 *
 * NOTHING in this module is ever called automatically. Every function that can
 * reach the vehicle is triggered from an explicit button press with the user's
 * confirmation, per the project's wake-safety rule.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildAddSchedulePayload, scheduleDifferences, scheduleMatches } from "@/lib/schedule-time";

export type ScheduleStatus =
  | "app_plan"
  | "pending"
  | "confirmed"
  | "removed"
  | "failed"
  | "differs"
  | "unknown_external";

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  app_plan: "App plan only",
  pending: "Sending…",
  confirmed: "Scheduled on Tesla",
  removed: "Removed from Tesla",
  failed: "Failed to send",
  differs: "Tesla schedule differs",
  unknown_external: "External Tesla schedule",
};

export interface ChargeSchedule {
  id: string;
  provider: string;
  vehicle_id: string | null;
  tesla_vehicle_id: string | null;
  registration: string;
  plan_date: string | null;
  start_minutes: number;
  end_minutes: number | null;
  days_mask: number;
  one_time: boolean;
  charge_limit_soc: number | null;
  charge_limit_sent: boolean;
  estimated_kwh: number;
  estimated_cost_gbp: number;
  avg_pence_per_kwh: number;
  charger_kw: number;
  status: ScheduleStatus;
  tesla_schedule_id: number | null;
  created_by_app: boolean;
  last_error: string | null;
  last_verified_at: string | null;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSchedule(d: any): ChargeSchedule {
  return {
    id: d.id,
    provider: d.provider ?? "tesla",
    vehicle_id: d.vehicle_id ?? null,
    tesla_vehicle_id: d.tesla_vehicle_id ?? null,
    registration: d.registration ?? "",
    plan_date: d.plan_date ?? null,
    start_minutes: Number(d.start_minutes ?? 0),
    end_minutes: d.end_minutes === null || d.end_minutes === undefined ? null : Number(d.end_minutes),
    days_mask: Number(d.days_mask ?? 0),
    one_time: Boolean(d.one_time),
    charge_limit_soc: d.charge_limit_soc === null || d.charge_limit_soc === undefined ? null : Number(d.charge_limit_soc),
    charge_limit_sent: Boolean(d.charge_limit_sent),
    estimated_kwh: Number(d.estimated_kwh ?? 0),
    estimated_cost_gbp: Number(d.estimated_cost_gbp ?? 0),
    avg_pence_per_kwh: Number(d.avg_pence_per_kwh ?? 0),
    charger_kw: Number(d.charger_kw ?? 6.9),
    status: (d.status ?? "app_plan") as ScheduleStatus,
    tesla_schedule_id: d.tesla_schedule_id === null || d.tesla_schedule_id === undefined ? null : Number(d.tesla_schedule_id),
    created_by_app: d.created_by_app !== false,
    last_error: d.last_error ?? null,
    last_verified_at: d.last_verified_at ?? null,
    updated_at: d.updated_at,
  };
}

export type SchedulePlanInput = Omit<
  ChargeSchedule,
  "id" | "status" | "tesla_schedule_id" | "created_by_app" | "last_error" | "last_verified_at" | "updated_at" | "charge_limit_sent"
>;

async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Read-only: safe on page load, never touches the vehicle. */
export async function loadSchedules(): Promise<ChargeSchedule[]> {
  const uid = await userId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("charge_schedules")
    .select("*")
    .eq("user_id", uid)
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []).map(toSchedule);
}

/** Save (or update) an app-only plan. Sends nothing to the vehicle. */
export async function saveAppPlan(plan: SchedulePlanInput, existingId?: string): Promise<ChargeSchedule | null> {
  const uid = await userId();
  if (!uid) return null;
  const row = { ...plan, user_id: uid };
  const query = existingId
    ? supabase.from("charge_schedules").update(row).eq("id", existingId).select().maybeSingle()
    : supabase.from("charge_schedules").insert({ ...row, status: "app_plan" }).select().maybeSingle();
  const { data, error } = await query;
  if (error || !data) return null;
  return toSchedule(data);
}

export async function updateSchedule(id: string, patch: Record<string, unknown>): Promise<ChargeSchedule | null> {
  const { data, error } = await supabase
    .from("charge_schedules")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return toSchedule(data);
}

export async function deleteSchedule(id: string): Promise<void> {
  await supabase.from("charge_schedules").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// Tesla commands — explicit user action only
// ---------------------------------------------------------------------------

interface CommandBody {
  action: "dry_run" | "read" | "add" | "replace" | "remove" | "set_charge_limit" | "capability";
  tesla_vehicle_id?: string | null;
  confirmed?: boolean;
  start_minutes?: number;
  end_minutes?: number | null;
  days_mask?: number;
  one_time?: boolean;
  tesla_schedule_id?: number | null;
  charge_limit_soc?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTesla(body: CommandBody): Promise<any> {
  const { data, error } = await supabase.functions.invoke("tesla-charge-schedule", { body });
  if (error && !data) throw new Error(error.message);
  return data;
}

export interface TeslaSchedule {
  id: number;
  enabled?: boolean;
  start_time?: number;
  end_time?: number;
  start_enabled?: boolean;
  end_enabled?: boolean;
  days_of_week?: number;
  one_time?: boolean;
  lat?: number;
  lon?: number;
  name?: string;
}

/** Local, offline preview of the exact payload. No network, no wake. */
export function dryRunPayload(plan: Pick<ChargeSchedule, "start_minutes" | "end_minutes" | "days_mask" | "one_time">) {
  return buildAddSchedulePayload({
    startMinutes: plan.start_minutes,
    endMinutes: plan.end_minutes,
    daysMask: plan.days_mask,
    oneTime: plan.one_time,
  });
}

/** Server-side dry run: returns the endpoint + payload without contacting the car. */
export async function dryRunOnServer(plan: ChargeSchedule) {
  return callTesla({
    action: "dry_run",
    tesla_vehicle_id: plan.tesla_vehicle_id,
    start_minutes: plan.start_minutes,
    end_minutes: plan.end_minutes,
    days_mask: plan.days_mask,
    one_time: plan.one_time,
    charge_limit_soc: plan.charge_limit_soc,
  });
}

/** Read charge_schedule_data. wake=false semantics: this never wakes the car. */
export async function readTeslaSchedules(teslaVehicleId: string): Promise<{ schedules: TeslaSchedule[]; error?: string }> {
  const data = await callTesla({ action: "read", tesla_vehicle_id: teslaVehicleId });
  return { schedules: (data?.schedules ?? []) as TeslaSchedule[], error: data?.error };
}

export interface SendResult {
  ok: boolean;
  status: ScheduleStatus;
  message: string;
  teslaScheduleId?: number | null;
  verified?: boolean;
  /** Plain-English list of fields where the car disagrees with the plan. */
  differences?: string[];
}

export interface TeslaCapability {
  connected: boolean;
  chargingCommands: boolean;
  signedCommandsConfigured: boolean;
  /** Plain-English reason when the app is not ready to send. */
  reason?: string;
}

/**
 * Readiness check for the Send button. Inspects the stored connection only —
 * it never contacts the vehicle, so it can never wake the car.
 */
export async function checkTeslaCapability(teslaVehicleId?: string | null): Promise<TeslaCapability> {
  try {
    const data = await callTesla({ action: "capability", tesla_vehicle_id: teslaVehicleId ?? null });
    if (!data || data.error) {
      return { connected: false, chargingCommands: false, signedCommandsConfigured: false, reason: data?.error ?? "Tesla is not connected." };
    }
    const granted: string[] = Array.isArray(data.granted_scopes) ? data.granted_scopes : [];
    return {
      connected: Boolean(data.connected),
      chargingCommands: Boolean(data.charging_commands),
      signedCommandsConfigured: Boolean(data.signed_commands_configured),
      grantedScopes: granted,
      reason: data.charging_commands
        ? undefined
        : `Tesla granted these permissions: ${granted.join(", ") || "none"} — vehicle_charging_cmds is missing. Reconnect Tesla to grant it.`,
    };

  } catch (e) {
    return {
      connected: false,
      chargingCommands: false,
      signedCommandsConfigured: false,
      reason: e instanceof Error ? e.message : "Could not check the Tesla connection.",
    };
  }
}

/**
 * Send (or replace) the schedule on the vehicle. Requires the user to have
 * confirmed the dialog — the caller passes confirmed=true only from that path.
 */
export async function sendScheduleToTesla(plan: ChargeSchedule, opts: { replace?: boolean; alsoSetLimit?: boolean } = {}): Promise<SendResult> {
  if (!plan.tesla_vehicle_id) return { ok: false, status: "failed", message: "No Tesla vehicle is selected." };
  await updateSchedule(plan.id, { status: "pending", last_error: null });

  const data = await callTesla({
    action: opts.replace && plan.tesla_schedule_id ? "replace" : "add",
    confirmed: true,
    tesla_vehicle_id: plan.tesla_vehicle_id,
    start_minutes: plan.start_minutes,
    end_minutes: plan.end_minutes,
    days_mask: plan.days_mask,
    one_time: plan.one_time,
    tesla_schedule_id: plan.tesla_schedule_id,
  });

  if (!data?.ok) {
    // A failed command must never delete the app's plan — keep it, record why.
    await updateSchedule(plan.id, { status: "failed", last_error: data?.error ?? "Unknown Tesla error" });
    return { ok: false, status: "failed", message: data?.error ?? "Unknown Tesla error" };
  }

  const requested = { startMinutes: plan.start_minutes, endMinutes: plan.end_minutes, daysMask: plan.days_mask, oneTime: plan.one_time };
  const agrees = data.schedule ? scheduleMatches(requested, data.schedule) : Boolean(data.verified);
  const differences = data.schedule ? scheduleDifferences(requested, data.schedule) : agrees ? [] : ["Tesla did not return the schedule for checking."];
  const status: ScheduleStatus = agrees ? "confirmed" : "differs";

  await updateSchedule(plan.id, {
    status,
    tesla_schedule_id: data.tesla_schedule_id ?? plan.tesla_schedule_id,
    last_verified_at: new Date().toISOString(),
    verification: data.schedule ?? {},
    last_error: agrees ? null : data.verify_error ?? differences.join(" ") ?? "Tesla returned a schedule that differs from the request.",
  });

  let message = agrees
    ? "Charging schedule successfully sent to Tesla."
    : "Tesla accepted the command but the read-back did not match the plan.";

  if (opts.alsoSetLimit && plan.charge_limit_soc !== null) {
    const limitRes = await callTesla({
      action: "set_charge_limit",
      confirmed: true,
      tesla_vehicle_id: plan.tesla_vehicle_id,
      charge_limit_soc: plan.charge_limit_soc,
    });
    if (limitRes?.ok) {
      await updateSchedule(plan.id, { charge_limit_sent: true });
      message += ` Charge limit set to ${plan.charge_limit_soc}%.`;
    } else {
      message += ` Charge limit was NOT changed: ${limitRes?.error ?? "command failed"}.`;
    }
  }

  return { ok: true, status, message, teslaScheduleId: data.tesla_schedule_id ?? null, verified: agrees, differences };
}

/** Remove an app-created schedule from the vehicle. Never touches external ones. */
export async function removeScheduleFromTesla(plan: ChargeSchedule): Promise<SendResult> {
  if (!plan.tesla_schedule_id || !plan.tesla_vehicle_id) {
    return { ok: false, status: plan.status, message: "This plan has no Tesla schedule to remove." };
  }
  if (!plan.created_by_app) {
    return { ok: false, status: plan.status, message: "This schedule was not created by this app, so it will not be removed automatically." };
  }
  await updateSchedule(plan.id, { status: "pending" });
  const data = await callTesla({
    action: "remove",
    confirmed: true,
    tesla_vehicle_id: plan.tesla_vehicle_id,
    tesla_schedule_id: plan.tesla_schedule_id,
  });
  if (!data?.ok) {
    await updateSchedule(plan.id, { status: "failed", last_error: data?.error ?? "Remove failed" });
    return { ok: false, status: "failed", message: data?.error ?? "Remove failed" };
  }
  await updateSchedule(plan.id, { status: "removed", tesla_schedule_id: null, last_verified_at: new Date().toISOString(), last_error: null });
  return { ok: true, status: "removed", message: data.verified ? "Removed from Tesla and verified." : "Tesla accepted the removal but read-back could not confirm it." };
}
