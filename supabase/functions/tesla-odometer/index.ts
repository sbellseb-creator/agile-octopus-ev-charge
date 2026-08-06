import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getValidAccessToken } from "../_shared/teslaAuth.ts";

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
      // Not an error condition: the user simply has no Tesla linked.
      // Return 200 so the client can handle it gracefully.
      return jsonResponse({
        connected: false,
        odometer_miles: null,
      });
    }


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
