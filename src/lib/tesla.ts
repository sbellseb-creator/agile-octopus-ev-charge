import { supabase } from "@/integrations/supabase/client";

export interface TeslaVehicle {
  id: string;
  vin: string;
  vin_last4: string;
  display_name: string;
  state: string | null;
  battery_level: number | null;
  battery_range: number | null;
  charging_state: string | null;
  charge_limit_soc: number | null;
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

export async function startTeslaOAuth(): Promise<string> {
  const { data, error } = await supabase.functions.invoke(
    "tesla-oauth-start",
    {
      body: {
        device_id: getDeviceId(),
        return_url: window.location.origin,
      },
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data.url as string;
}

export async function listTeslaVehicles(
  wake = false,
): Promise<{
  connected: boolean;
  vehicles: TeslaVehicle[];
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke(
    "tesla-list-vehicles",
    {
      body: {
        device_id: getDeviceId(),
        wake,
      },
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    connected: Boolean(data?.connected),
    vehicles: data?.vehicles ?? [],
    error: data?.error,
  };
}