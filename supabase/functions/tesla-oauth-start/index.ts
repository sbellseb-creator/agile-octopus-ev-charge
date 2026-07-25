import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TESLA_AUTH = "https://auth.tesla.com/oauth2/v3/authorize";
const SCOPES = "openid offline_access vehicle_device_data";

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(text: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(buf);
}
function rand(len = 48): string {
  return b64url(crypto.getRandomValues(new Uint8Array(len)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { device_id, return_url } = await req.json();
    if (!device_id || !return_url) {
      return new Response(JSON.stringify({ error: "device_id and return_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("TESLA_CLIENT_ID");
    if (!clientId) throw new Error("TESLA_CLIENT_ID not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const state = rand(24);
    const codeVerifier = rand(48);
    const codeChallenge = b64url(await sha256(codeVerifier));

    const { error } = await supabase.from("tesla_oauth_states").insert({
      state, device_id, code_verifier: codeVerifier, return_url,
    });
    if (error) throw error;

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tesla-oauth-callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login",
    });

    return new Response(JSON.stringify({ authorize_url: `${TESLA_AUTH}?${params}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
