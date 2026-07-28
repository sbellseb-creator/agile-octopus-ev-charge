import { supabase } from "@/integrations/supabase/client";

export interface TeslaVehicle {
  id: string;
  vin_last4: string;
  display_name: string;
  state: string | null;
  battery_level: number | null;
  charging_state: string | null;
  charge_limit_soc: number | null;
}

export interface TeslaListResult {
  connected: boolean;
  vehicles: TeslaVehicle[];
  cached?: boolean;
  last_updated?: string;
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

/**
 * List the connected Tesla vehicles.
 * @param wake ONLY pass true from an explicit user-initiated Refresh action.
 *             Application load and navigation must always pass false so the
 *             car is never woken.
 */
export async function listTeslaVehicles(wake = false): Promise<TeslaListResult> {
  await requireSession();
  const { data, error } = await supabase.functions.invoke("tesla-list-vehicles", {
    body: { device_id: getDeviceId(), wake: wake === true },
  });
  if (error && !data) throw new Error(error.message);
  return {
    connected: Boolean(data?.connected),
    vehicles: data?.vehicles ?? [],
    cached: data?.cached,
    last_updated: data?.last_updated,
    error: data?.error,
  };
}
