import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { logEvent, safeMessage, serviceClient } from "../_shared/auth.ts";

const AUTH_BASE = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";
const FN = "tesla-oauth-callback";

function safeReturn(returnUrl: string | null | undefined) {
  if (!returnUrl) return null;
  try {
    const u = new URL(returnUrl);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * The edge gateway serves function responses with
 * `content-security-policy: default-src 'none'; sandbox`, so inline scripts in
 * an HTML body never execute. Use a real 302 redirect instead.
 */
function redirectBack(returnUrl: string | null | undefined, params: Record<string, string>) {
  const u = safeReturn(returnUrl);
  if (u) {
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: u.toString() } });
  }
  const message = params.tesla_error ?? "Tesla connected. You can close this window.";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Tesla</title></head>` +
      `<body style="font-family:system-ui;background:#0b0f10;color:#e6f7ef;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
      `<p>${message.replace(/[<>&]/g, "")}</p></body></html>`,
    { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  let returnUrl: string | null = null;
  try {
    if (!code || !state) {
      return redirectBack(null, { tesla_error: "Missing authorization code." });
    }

    const supabase = serviceClient();

    // Clear anything already expired before validating.
    await supabase.from("tesla_oauth_states").delete().lt("expires_at", new Date().toISOString());

    const { data: stateRow, error: stateErr } = await supabase
      .from("tesla_oauth_states")
      .select("*")
      .eq("state", state)
      .maybeSingle();
    if (stateErr) throw new Error(stateErr.message);
    if (!stateRow) {
      logEvent(FN, "invalid_or_expired_state", {}, "warn");
      return redirectBack(null, { tesla_error: "Invalid or expired sign-in state." });
    }
    returnUrl = stateRow.return_url ?? null;


    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tesla-oauth-callback`;
    const tokenRes = await fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: Deno.env.get("TESLA_CLIENT_ID")!,
        client_secret: Deno.env.get("TESLA_CLIENT_SECRET")!,
        code,
        redirect_uri: redirectUri,
        code_verifier: stateRow.code_verifier,
      }),
    });

    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      let detail = "";
      try {
        const j = JSON.parse(tokenText);
        detail = String(j.error_description ?? j.error ?? "").slice(0, 200);
      } catch {
        detail = tokenText.slice(0, 200);
      }
      logEvent(FN, "token_exchange_failed", { status: tokenRes.status, detail }, "error");
      return redirectBack(stateRow.return_url, {
        tesla_error: `Tesla token exchange failed (${tokenRes.status}): ${detail || "no detail returned"}`,
      });
    }
    const token = JSON.parse(tokenText);

    // Granted scopes: prefer the token response, fall back to the access token's scp claim.
    let granted: string[] = String(token.scope ?? "").split(" ").filter(Boolean);
    if (granted.length === 0) {
      try {
        const part = String(token.access_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
        if (Array.isArray(claims?.scp)) granted = claims.scp as string[];
      } catch { /* ignore */ }
    }

    const expiresAt = new Date(Date.now() + (Number(token.expires_in) || 28800) * 1000).toISOString();

    // One connection per user. The user_id column has a unique index, so any
    // previous connection from a different browser/device must go first —
    // otherwise the upsert on device_id fails with a duplicate-key error and
    // the freshly granted token (including new scopes) is silently lost.
    await supabase
      .from("tesla_connections")
      .delete()
      .eq("user_id", stateRow.user_id)
      .neq("device_id", stateRow.device_id);

    const { error: upsertErr } = await supabase.from("tesla_connections").upsert(
      {
        device_id: stateRow.device_id,
        user_id: stateRow.user_id,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: expiresAt,
        scopes: granted,
        region: "eu",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" },
    );
    if (upsertErr) throw new Error(upsertErr.message);

    await supabase.from("tesla_oauth_states").delete().eq("state", state);

    logEvent(FN, "connected", { userId: stateRow.user_id, granted_scopes: granted.join(",") });
    return redirectBack(stateRow.return_url, { tesla: "connected", tesla_scopes: granted.join(" ") });

  } catch (e) {
    const detail = safeMessage(e);
    logEvent(FN, "unhandled_error", { message: detail, stack: e instanceof Error ? (e.stack ?? "").slice(0, 400) : "" }, "error");
    return redirectBack(returnUrl, { tesla_error: `Tesla sign-in could not be completed: ${detail}` });
  }
});
