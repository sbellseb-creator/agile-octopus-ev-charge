import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";
const SCOPES = "openid offline_access vehicle_device_data";

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64url(new Uint8Array(digest));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const clientId = Deno.env.get("TESLA_CLIENT_ID");
    if (!clientId) {
      return new Response(JSON.stringify({ error: "TESLA_CLIENT_ID not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const deviceId = String(body.device_id ?? "").slice(0, 128);
    const returnUrl = String(body.return_url ?? "");
    if (!deviceId || !returnUrl.startsWith("http")) {
      return new Response(JSON.stringify({ error: "device_id and return_url are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
    const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
    const codeChallenge = await sha256(codeVerifier);

    const { error } = await supabase.from("tesla_oauth_states").insert({
      state,
      code_verifier: codeVerifier,
      device_id: deviceId,
      return_url: returnUrl,
    });
    if (error) throw new Error(error.message);

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tesla-oauth-callback`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login",
    });

    return new Response(
      JSON.stringify({ url: `${AUTH_BASE}/authorize?${params.toString()}`, redirect_uri: redirectUri }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("tesla-oauth-start error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
