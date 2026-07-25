import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TESLA_TOKEN = "https://auth.tesla.com/oauth2/v3/token";

function htmlRedirect(url: string, message: string): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><p>${message}</p><p><a style="color:#22c55e" href="${url}">Continue</a></p></div><script>setTimeout(()=>location.href=${JSON.stringify(url)},500)</script></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (err) throw new Error(`Tesla error: ${err} ${url.searchParams.get("error_description") ?? ""}`);
    if (!code || !state) throw new Error("Missing code/state");

    const { data: st, error: stErr } = await supabase
      .from("tesla_oauth_states").select("*").eq("state", state).maybeSingle();
    if (stErr || !st) throw new Error("Invalid or expired state");

    const clientId = Deno.env.get("TESLA_CLIENT_ID")!;
    const clientSecret = Deno.env.get("TESLA_CLIENT_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tesla-oauth-callback`;

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: st.code_verifier,
      audience: "https://fleet-api.prd.eu.vn.cloud.tesla.com",
    });

    const tokenRes = await fetch(TESLA_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed [${tokenRes.status}]: ${await tokenRes.text()}`);
    }
    const tok = await tokenRes.json();
    const expiresAt = new Date(Date.now() + (tok.expires_in ?? 28800) * 1000).toISOString();

    const { error: upErr } = await supabase.from("tesla_connections").upsert({
      device_id: st.device_id,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: expiresAt,
      region: "eu",
      updated_at: new Date().toISOString(),
    });
    if (upErr) throw upErr;

    await supabase.from("tesla_oauth_states").delete().eq("state", state);

    const returnUrl = new URL(st.return_url);
    returnUrl.searchParams.set("tesla", "connected");
    return htmlRedirect(returnUrl.toString(), "Tesla connected. Redirecting…");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("tesla-oauth-callback:", msg);
    return new Response(
      `<!doctype html><body style="font-family:system-ui;padding:2rem;background:#0a0a0a;color:#fca5a5"><h2>Tesla sign-in failed</h2><pre>${msg}</pre></body>`,
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }
});
