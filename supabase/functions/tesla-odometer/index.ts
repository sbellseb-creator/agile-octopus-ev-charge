import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getAuthedUserId, serviceClient } from "../_shared/auth.ts";
import { getConnection, getValidAccessToken } from "../_shared/tesla.ts";

const FLEET_BASE =
  "https://fleet-api.prd.eu.vn.cloud.tesla.com";

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
    const vin = String(body.vin ?? "").trim();
    const wake = body.wake === true;

    if (!deviceId) {
      return jsonResponse(
        { error: "device_id is required" },
        400,
      );
    }

    if (!vin) {
      return jsonResponse(
        { error: "vin is required" },
        400,
      );
    }

    const userId = await getAuthedUserId(request);

    if (!userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = serviceClient();
    const conn = await getConnection(supabase, userId);

    if (!conn) {
      return jsonResponse(
        {
          connected: false,
          error: "Tesla is not connected",
        },
        401,
      );
    }

    if (conn.device_id !== deviceId) {
      return jsonResponse(
        { error: "Device does not belong to the caller" },
        403,
      );
    }

    const vehicles = Array.isArray(conn.vehicles)
      ? conn.vehicles as Array<{ id?: string; vin_last4?: string }>
      : [];
    const ownsVehicle = vehicles.some((v) =>
      (v.vin_last4 && v.vin_last4 === vin.slice(-4)) ||
      (v.id && v.id === vin)
    );

    if (!ownsVehicle) {
      return jsonResponse(
        { error: "Vehicle does not belong to the caller" },
        403,
      );
    }

    const accessToken = await getValidAccessToken(supabase, conn);

    if (wake) {
      const wakeResponse = await fetch(
        `${FLEET_BASE}/api/1/vehicles/${
          encodeURIComponent(vin)
        }/wake_up`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      if (!wakeResponse.ok) {
        const wakeText = await wakeResponse.text();

        console.error(
          "Tesla wake failed:",
          wakeResponse.status,
          wakeText,
        );
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, 15_000)
        );
      }
    }

    const response = await fetch(
      `${FLEET_BASE}/api/1/vehicles/${
        encodeURIComponent(vin)
      }/vehicle_data?endpoints=vehicle_state`,
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
        "Tesla odometer request failed:",
        response.status,
        responseText,
      );

      return jsonResponse(
        {
          connected: true,
          error: `Tesla API error (${response.status})`,
        },
        502,
      );
    }

    const data = JSON.parse(responseText) as {
      response?: {
        vehicle_state?: {
          odometer?: number;
        };
      };
    };

    const odometer =
      data.response?.vehicle_state?.odometer;

    if (
      typeof odometer !== "number" ||
      !Number.isFinite(odometer)
    ) {
      return jsonResponse(
        {
          connected: true,
          error: "Tesla did not return an odometer reading",
        },
        502,
      );
    }

    return jsonResponse({
      connected: true,
      vin_last4: vin.slice(-4),
      odometer_miles: odometer,
    });
  } catch (error) {
    console.error("tesla-odometer error:", error);

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
