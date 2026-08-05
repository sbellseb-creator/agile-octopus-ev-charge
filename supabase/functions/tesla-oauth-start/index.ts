import { createClient } from "npm:@supabase/supabase-js@2";

const AUTHORIZE_URL =
  "https://auth.tesla.com/oauth2/v3/authorize";

const SCOPES = [
  "openid",
  "offline_access",
  "vehicle_device_data",
  "vehicle_charging_cmds",
].join(" ");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoded,
  );

  return base64url(new Uint8Array(digest));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
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
    const clientId = Deno.env.get("TESLA_CLIENT_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!clientId) {
      return jsonResponse(
        { error: "TESLA_CLIENT_ID is not configured" },
        500,
      );
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: "Supabase server environment is not configured" },
        500,
      );
    }

    const body = await request
      .json()
      .catch(() => ({}));

    const deviceId = String(
      body.device_id ?? "",
    ).trim().slice(0, 128);

    const returnUrl = String(
      body.return_url ?? "",
    ).trim();

    if (!deviceId) {
      return jsonResponse(
        { error: "device_id is required" },
        400,
      );
    }

    let parsedReturnUrl: URL;

    try {
      parsedReturnUrl = new URL(returnUrl);
    } catch {
      return jsonResponse(
        { error: "return_url must be a valid URL" },
        400,
      );
    }

    if (
      parsedReturnUrl.protocol !== "https:" &&
      parsedReturnUrl.hostname !== "localhost"
    ) {
      return jsonResponse(
        { error: "return_url must use HTTPS" },
        400,
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    const state = base64url(
      crypto.getRandomValues(new Uint8Array(24)),
    );

    const codeVerifier = base64url(
      crypto.getRandomValues(new Uint8Array(48)),
    );

    const codeChallenge = await sha256(codeVerifier);

    const { error: stateError } = await supabase
      .from("tesla_oauth_states")
      .insert({
        state,
        code_verifier: codeVerifier,
        device_id: deviceId,
        return_url: returnUrl,
      });

    if (stateError) {
      throw new Error(stateError.message);
    }

    const redirectUri =
      `${supabaseUrl}/functions/v1/tesla-oauth-callback`;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login",
      prompt_missing_scopes: "true",
      require_requested_scopes: "true",
    });

    return jsonResponse({
      url: `${AUTHORIZE_URL}?${params.toString()}`,
      redirect_uri: redirectUri,
    });
  } catch (error) {
    console.error("tesla-oauth-start error:", error);

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