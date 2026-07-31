import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getValidAccessToken } from "../_shared/teslaAuth.ts";

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

    return jsonResponse({
      connected: Boolean(accessToken),
    });
  } catch (error) {
    console.error("tesla-refresh-token error:", error);

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