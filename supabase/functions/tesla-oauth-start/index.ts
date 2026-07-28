import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getAuthedUserId, logEvent, safeMessage, serviceClient } from "../_shared/auth.ts";

const AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";
const SCOPES = "openid offline_access vehicle_device_data";
const FN = "tesla-oauth-start";

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
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const userId = await getAuthedUserId(req);
    if (!userId) {
      logEvent(FN, "unauthorized", {}, "warn");
      return json({ error: "Unauthorized" }, 401);
    }

    const clientId = Deno.env.get("TESLA_CLIENT_ID");
    if (!clientId) {
      logEvent(FN, "missing_client_id", {}, "error");
      return json({ error: "Tesla integration is not configured" }, 500);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const deviceId = String(body.device_id ?? "").slice(0, 128);
    const returnUrl = String(body.return_url ?? "");
    if (!deviceId || !/^https?:\/\//.test(returnUrl) || returnUrl.length > 512) {
      return json({ error: "device_id and a valid return_url are required" }, 400);
    }

    const supabase = serviceClient();

    // Housekeeping: remove expired/stale sign-in states.
    await supabase
      .from("tesla_oauth_states")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // Conservative rate limit: at most 5 sign-in attempts per user per 10 minutes.
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await supabase
      .from("tesla_oauth_states")
      .select("state", { count: "exact", head: true })
      .eq("user_id", userId)
      .gt("created_at", since);
    if ((count ?? 0) >= 5) {
      logEvent(FN, "rate_limited", { userId, count }, "warn");
      return json({ error: "Too many sign-in attempts. Please wait a few minutes." }, 429);
    }

    const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
    const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
    const codeChallenge = await sha256(codeVerifier);

    const { error } = await supabase.from("tesla_oauth_states").insert({
      state,
      code_verifier: codeVerifier,
      device_id: deviceId,
      user_id: userId,
      return_url: returnUrl,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
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

    logEvent(FN, "authorize_url_issued", { userId });
    return json({ url: `${AUTH_BASE}/authorize?${params.toString()}`, redirect_uri: redirectUri });
  } catch (e) {
    logEvent(FN, "unhandled_error", { message: safeMessage(e) }, "error");
    return json({ error: safeMessage(e) }, 500);
  }
});
