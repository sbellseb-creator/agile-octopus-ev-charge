import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "tesla_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export interface TeslaVehicle {
  id: string;
  name: string;
  vin_last4: string;
  state: string;
  online: boolean;
  battery_level: number | null;
  charging_state: string | null;
  charge_limit_soc: number | null;
}

export async function startTeslaOAuth(): Promise<void> {
  const device_id = getDeviceId();
  const return_url = window.location.origin + window.location.pathname;
  const { data, error } = await supabase.functions.invoke("tesla-oauth-start", {
    body: { device_id, return_url },
  });
  if (error) throw error;
  if (!data?.authorize_url) throw new Error("No authorize URL returned");
  window.location.href = data.authorize_url as string;
}

export async function listTeslaVehicles(): Promise<{ connected: boolean; vehicles?: TeslaVehicle[]; error?: string }> {
  const device_id = getDeviceId();
  const { data, error } = await supabase.functions.invoke("tesla-list-vehicles", {
    body: { device_id },
  });
  if (error) return { connected: false, error: error.message };
  return data;
}
