import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getValidAccessToken } from "../_shared/teslaAuth.ts";

const FLEET_BASE =
  "https://fleet-api.prd.eu.vn.cloud.tesla.com";

interface TeslaApiVehicle {
  id: string | number;
  vin?: string;
  display_name?: string;
  state?: string;
}

interface TeslaVehicleData {
  response?: {
    charge_state?: {
      battery_level?: number;
      battery_range?: number;
      charging_state?: string;
      charge_limit_soc?: number;
    };
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function wakeVehicle(
  accessToken: string,
  vin: string,
): Promise<void> {
  const response = await fetch(
    `${FLEET_BASE}/api/1/vehicles/${encodeURIComponent(vin)}/wake_up`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      "Tesla wake failed:",
      response.status,
      responseText,
    );

    throw new Error(
      `Tesla wake request failed (${response.status})`,
    );
  }
}

async function loadChargeState(
  accessToken: string,
  vin: string,
): Promise<{
  batteryLevel: number | null;
  batteryRange: number | null;
  chargingState: string | null;
  chargeLimitSoc: number | null;
}> {
  const response = await fetch(
    `${FLEET_BASE}/api/1/vehicles/${
      encodeURIComponent(vin)
    }/vehicle_data?endpoints=charge_state`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      "Tesla vehicle_data failed:",
      response.status,
      responseText,
    );

    return {
      batteryLevel: null,
      batteryRange: null,
      chargingState: null,
      chargeLimitSoc: null,
    };
  }

  let data: TeslaVehicleData;

  try {
    data = JSON.parse(responseText) as TeslaVehicleData;
  } catch {
    console.error(
      "Tesla vehicle_data returned invalid JSON",
    );

    return {
      batteryLevel: null,
      batteryRange: null,
      chargingState: null,
      chargeLimitSoc: null,
    };
  }

  const chargeState =
    data.response?.charge_state ?? {};

  return {
    batteryLevel: chargeState.battery_level ?? null,
    batteryRange: chargeState.battery_range ?? null,
    chargingState: chargeState.charging_state ?? null,
    chargeLimitSoc:
      chargeState.charge_limit_soc ?? null,
  };
}


interface LocalTeslaVehicle {
  id: string;
  vin: string;
  display_name: string;
}

async function syncTeslaVehicle(
  supabase: ReturnType<typeof createClient>,
  vehicle: LocalTeslaVehicle,
): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from("vehicles")
    .select("id")
    .eq("tesla_vehicle_id", vehicle.id)
    .maybeSingle();

  if (findError) {
    console.error(
      "Could not find local Tesla vehicle:",
      findError,
    );
    return;
  }

  const teslaFields = {
    source: "tesla",
    vin: vehicle.vin,
    tesla_vehicle_id: vehicle.id,
    registration: "ND74 VCA",
    paint_colour: "Quicksilver",
  };

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("vehicles")
      .update(teslaFields)
      .eq("id", existing.id);

    if (updateError) {
      console.error(
        "Could not update local Tesla vehicle:",
        updateError,
      );
    }

    return;
  }

  // Ensure the Tesla becomes the default vehicle.
  const { error: defaultError } = await supabase
    .from("vehicles")
    .update({ is_default: false })
    .eq("is_default", true);

  if (defaultError) {
    console.error(
      "Could not clear existing default vehicle:",
      defaultError,
    );
  }

  const { error: insertError } = await supabase
    .from("vehicles")
    .insert({
      name:
        vehicle.display_name &&
        vehicle.display_name.toLowerCase() !== "tesla"
          ? vehicle.display_name
          : "My Model Y",
      make: "Tesla",
      model: "Model Y Long Range RWD",
      battery_kwh: 75,
      charge_efficiency_pct: 93,
      miles_per_kwh: 3.9,
      is_default: true,
      color: "#b8bcc2",
      notes: "Automatically linked from Tesla Fleet API.",
      ...teslaFields,
    });

  if (insertError) {
    console.error(
      "Could not create local Tesla vehicle:",
      insertError,
    );
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const deviceId = String(body.device_id ?? "").trim();
    const wake = body.wake === true;

    if (!deviceId) {
      return jsonResponse(
        { error: "device_id is required" },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Supabase server environment is not configured",
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    const accessToken = await getValidAccessToken(
      supabase,
      deviceId,
    );

    if (!accessToken) {
      return jsonResponse({
        connected: false,
        vehicles: [],
      });
    }

    const listResponse = await fetch(
      `${FLEET_BASE}/api/1/vehicles`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const listText = await listResponse.text();

    if (!listResponse.ok) {
      console.error(
        "Tesla vehicles list failed:",
        listResponse.status,
        listText,
      );

      return jsonResponse(
        {
          connected: true,
          error: `Tesla API error (${listResponse.status})`,
          vehicles: [],
        },
        502,
      );
    }

    const list = JSON.parse(listText) as {
      response?: TeslaApiVehicle[];
    };

    const vehicles = [];

    for (const vehicle of list.response ?? []) {
      const vin = String(vehicle.vin ?? "").trim();
      const state = vehicle.state ?? null;

      if (!vin) {
        console.error(
          `Tesla vehicle ${vehicle.id} did not include a VIN`,
        );
        continue;
      }

      if (
        wake &&
        (state === "offline" || state === "asleep")
      ) {
        console.log(`Waking Tesla ${vin.slice(-4)}...`);

        try {
          await wakeVehicle(accessToken, vin);

          await new Promise((resolve) =>
            setTimeout(resolve, 15_000)
          );
        } catch (error) {
          console.error(
            `Could not wake Tesla ${vin.slice(-4)}:`,
            error,
          );
        }
      }

      const chargeState = await loadChargeState(
        accessToken,
        vin,
      );

      const mappedVehicle = {
        id: String(vehicle.id),
        vin,
        vin_last4: vin.slice(-4),
        display_name:
          vehicle.display_name ?? "Tesla",
        state,
        battery_level:
          chargeState.batteryLevel,
        battery_range:
          chargeState.batteryRange,
        charging_state:
          chargeState.chargingState,
        charge_limit_soc:
          chargeState.chargeLimitSoc,
      };

      vehicles.push(mappedVehicle);

      await syncTeslaVehicle(supabase, {
        id: mappedVehicle.id,
        vin: mappedVehicle.vin,
        display_name: mappedVehicle.display_name,
      });
    }

    const { error: updateError } = await supabase
      .from("tesla_connections")
      .update({
        vehicles,
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId);

    if (updateError) {
      console.error(
        "Could not cache Tesla vehicles:",
        updateError,
      );
    }

    return jsonResponse({
      connected: true,
      vehicles,
    });
  } catch (error) {
    console.error(
      "tesla-list-vehicles error:",
      error,
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      500,
    );
  }
});