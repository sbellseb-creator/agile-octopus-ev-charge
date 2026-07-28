/**
 * Shared, dependency-free helpers for Tesla charge-schedule commands.
 * Mirrors src/lib/schedule-time.ts so the client preview and the server command
 * build byte-identical payloads.
 */

export interface SchedulePayloadInput {
  startMinutes: number;
  endMinutes: number | null;
  daysMask: number;
  oneTime: boolean;
  lat?: number | null;
  lon?: number | null;
  scheduleId?: number | null;
}

export function buildAddSchedulePayload(input: SchedulePayloadInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    days_of_week: Number(input.daysMask) || 0,
    enabled: true,
    one_time: input.oneTime !== false,
    start_enabled: true,
    start_time: Math.round(Number(input.startMinutes) || 0),
    end_enabled: input.endMinutes !== null && input.endMinutes !== undefined,
    end_time: input.endMinutes ?? 0,
  };
  if (typeof input.lat === "number" && typeof input.lon === "number") {
    payload.lat = input.lat;
    payload.lon = input.lon;
  }
  if (input.scheduleId) payload.id = input.scheduleId;
  return payload;
}

/** Map a Tesla failure to a stable code plus a plain-English explanation. */
export function explainTeslaFailure(
  status: number,
  rawBody: string,
): { code: string; message: string; detail: string } {
  const body = (rawBody || "").toLowerCase();
  // The verbatim Tesla response always travels with the explanation so the UI
  // and logs can show exactly what Tesla said, never a substituted message.
  const detail = `HTTP ${status}: ${(rawBody || "").slice(0, 600)}`;
  const out = (code: string, message: string) => ({ code, message: `${message} (Tesla said — ${detail})`, detail });

  if (body.includes("unsigned command") || body.includes("vehicle command protocol") || body.includes("signature")) {
    return out("signed_command_required", "This vehicle requires signed commands (Tesla Vehicle Command Protocol). The virtual key must be paired with the car and the command proxy must be configured.");
  }
  if (body.includes("virtual key") || body.includes("keys not paired") || body.includes("missing_key")) {
    return out("missing_virtual_key", "The app's virtual key is not paired with this vehicle. Add the key in the Tesla app, then retry.");
  }
  if (status === 401 || body.includes("invalid bearer") || body.includes("token expired")) {
    return out("auth_expired", "The Tesla sign-in has expired. Reconnect Tesla and try again.");
  }
  if (status === 403 || body.includes("scope")) {
    return out("missing_scope", "The Tesla connection is missing the charging-commands permission. Reconnect Tesla to grant it.");
  }
  if (status === 404) return out("not_found", "Tesla could not find that vehicle or schedule.");
  if (status === 408 || body.includes("timeout") || body.includes("vehicle unavailable") || body.includes("asleep")) {
    return out("vehicle_unavailable", "The vehicle is asleep or unreachable right now. Try the command again.");
  }
  if (body.includes("offline")) return out("vehicle_offline", "The vehicle is offline. Try again when it has signal.");
  if (body.includes("firmware") || body.includes("not supported") || body.includes("unsupported")) {
    return out("unsupported_firmware", "This vehicle's firmware does not support charge schedules through the Fleet API.");
  }
  if (body.includes("limit") && body.includes("schedule")) {
    return out("schedule_limit", "The vehicle has reached its maximum number of charge schedules. Remove one in the Tesla app first.");
  }
  if (status === 429) return out("rate_limited", "Tesla is rate limiting requests. Wait a moment and retry.");
  return out("command_failed", "Tesla rejected the command.");
}
