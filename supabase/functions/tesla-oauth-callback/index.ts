import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AUTH_BASE =
  "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";

const TESLA_AUDIENCE =
  "https://fleet-api.prd.eu.vn.cloud.tesla.com";

function html(message: string, returnUrl?: string) {
  return `<!doctype html>
<meta charset="utf-8">
<title>Tesla</title>
<body style="font-family:system-ui;background:#0b0f10;color:#e6f7ef;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <p>${message}</p>
    ${
      returnUrl
        ? `<p><a style="color:#22d3ee" href="${returnUrl}">Return to app</a></p>
<script>
  setTimeout(() => location.replace(${JSON.stringify(returnUrl)}), 1200);
</script>`
        : ""
    }
  </div>
</body>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const htmlHeaders = {
    ...corsHeaders,
    "Content-Type": "text/html; charset=utf-8",
  };

  try {
    if (!code || !state) {
      return new Response(
        html("Missing authorization code."),
        {
          status: 400,
          headers: htmlHeaders,
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const clientId = Deno.env.get("TESLA_CLIENT_ID");
    const clientSecret = Deno.env.get(
      "TESLA_CLIENT_SECRET",
    );

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !clientId ||
      !clientSecret
    ) {
      throw new Error(
        "Required server environment variables are missing",
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    const { data: stateRow, error: stateError } =
      await supabase
        .from("tesla_oauth_states")
        .select("*")
        .eq("state", state)
        .maybeSingle();

    if (stateError) {
      throw new Error(stateError.message);
    }

    if (!stateRow) {
      return new Response(
        html("Invalid or expired sign-in state."),
        {
          status: 400,
          headers: htmlHeaders,
        },
      );
    }

    const redirectUri =
      `${supabaseUrl}/functions/v1/tesla-oauth-callback`;

    const tokenResponse = await fetch(
      `${AUTH_BASE}/token`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code,
          audience: TESLA_AUDIENCE,
          redirect_uri: redirectUri,
          code_verifier: stateRow.code_verifier,
        }),
      },
    );

    const tokenText = await tokenResponse.text();

    if (!tokenResponse.ok) {
      console.error(
        "Tesla token exchange failed:",
        tokenResponse.status,
        tokenText,
      );

      return new Response(
        html(
          `Tesla sign-in failed (${tokenResponse.status}).`,
          stateRow.return_url,
        ),
        {
          status: 502,
          headers: htmlHeaders,
        },
      );
    }

    const token = JSON.parse(tokenText);

    if (!token.access_token || !token.refresh_token) {
      throw new Error(
        "Tesla token response was missing required tokens",
      );
    }

    const expiresIn =
      Number(token.expires_in) || 28_800;

    const expiresAt = new Date(
      Date.now() + expiresIn * 1000,
    ).toISOString();

    const { error: upsertError } = await supabase
      .from("tesla_connections")
      .upsert(
        {
          device_id: stateRow.device_id,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: expiresAt,
          region: "eu",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "device_id",
        },
      );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    await supabase
      .from("tesla_oauth_states")
      .delete()
      .eq("state", state);

    return new Response(
      html(
        "Tesla connected. Redirecting…",
        stateRow.return_url,
      ),
      {
        headers: htmlHeaders,
      },
    );
  } catch (error) {
    console.error(
      "tesla-oauth-callback error:",
      error,
    );

    return new Response(
      html(
        "Something went wrong completing Tesla sign-in.",
      ),
      {
        status: 500,
        headers: htmlHeaders,
      },
    );
  }
});
