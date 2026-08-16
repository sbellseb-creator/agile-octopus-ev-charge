import { supabase } from "@/integrations/supabase/client";

export interface TeslaVehicle {
  id: string;
  vin_last4: string;
  display_name: string;
  state: string | null;
  battery_level: number | null;
  charging_state: string | null;
  charge_limit_soc: number | null;
  /** Trusted Tesla configuration data — null when Tesla did not provide it. */
  car_type?: string | null;
  trim_badging?: string | null;
  exterior_color?: string | null;
  charge_port_latch?: string | null;
  charger_power_kw?: number | null;
  /** Tesla-reported current flowing now, distinct from the configured limit. */
  charger_actual_current?: number | null;
  /** Compatibility field used by some Fleet API response versions. */
  charge_amps?: number | null;
  /** Tesla-reported estimated hours remaining to the active charge target. */
  time_to_full_charge?: number | null;
  /** Tesla session energy counter when supplied by Fleet telemetry. */
  charge_energy_added_kwh?: number | null;
  /** Native Tesla charge-state field used by some proxy versions. */
  charge_energy_added?: number | null;
}

export interface TeslaListResult {
  connected: boolean;
  vehicles: TeslaVehicle[];
  cached?: boolean;
  last_updated?: string;
  /** True when the request was allowed to wake the car. */
  woke?: boolean;
  /** True when the refresh was throttled and cached data was returned. */
  rateLimited?: boolean;
  error?: string;
}

const DEVICE_KEY = "tesla_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Please sign in to use the Tesla connection.");
}

export async function startTeslaOAuth(): Promise<string> {
  await requireSession();
  const { data, error } = await supabase.functions.invoke("tesla-oauth-start", {
    body: { device_id: getDeviceId(), return_url: window.location.origin },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data.url as string;
}

/** Diagnostics: last Tesla poll recorded by the client (non-sensitive). */
export interface TeslaDiagnostics {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_wake_flag: boolean | null;
  connected: boolean | null;
}

const DIAG_KEY = "tesla-diagnostics";

export function getTeslaDiagnostics(): TeslaDiagnostics {
  try {
    const raw = localStorage.getItem(DIAG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return parsed as TeslaDiagnostics;
  } catch {
    /* ignore */
  }
  return { last_attempt_at: null, last_success_at: null, last_wake_flag: null, connected: null };
}

function setTeslaDiagnostics(patch: Partial<TeslaDiagnostics>) {
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify({ ...getTeslaDiagnostics(), ...patch }));
  } catch {
    /* ignore */
  }
}

/**
 * List the connected Tesla vehicles.
 * @param wake ONLY pass true from an explicit user-initiated Refresh action.
 *             Application load and navigation must always pass false so the
 *             car is never woken.
 */
export async function listTeslaVehicles(wake = false): Promise<TeslaListResult> {
  await requireSession();
  const wakeFlag = wake === true;
  setTeslaDiagnostics({ last_attempt_at: new Date().toISOString(), last_wake_flag: wakeFlag });
  const { data, error } = await supabase.functions.invoke("tesla-list-vehicles", {
    body: { device_id: getDeviceId(), wake: wakeFlag },
  });

  // Non-2xx responses give an error with the body on `context`; recover the payload
  // so throttled refreshes still show cached vehicles instead of blanking the UI.
  let payload = data as Record<string, unknown> | null;
  if (error && !payload) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      payload = await ctx.json().catch(() => null);
    }
    if (!payload) throw new Error(error.message);
  }

  const result: TeslaListResult = {
    connected: Boolean(payload?.connected),
    vehicles: (payload?.vehicles as TeslaVehicle[]) ?? [],
    cached: payload?.cached as boolean | undefined,
    last_updated: payload?.last_updated as string | undefined,
    woke: payload?.woke as boolean | undefined,
    rateLimited: payload?.rate_limited === true,
    error: payload?.error as string | undefined,
  };
  setTeslaDiagnostics({
    connected: result.connected,
    ...(result.error ? {} : { last_success_at: new Date().toISOString() }),
  });
  return result;
}
