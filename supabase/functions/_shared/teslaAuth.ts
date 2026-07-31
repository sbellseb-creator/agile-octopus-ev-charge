import { createClient } from "npm:@supabase/supabase-js@2";

const AUTH_BASE =
  "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3";

export type SupabaseAdminClient = ReturnType<typeof createClient>;

interface TeslaConnection {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface TeslaTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function getValidAccessToken(
  supabase: SupabaseAdminClient,
  deviceId: string,
): Promise<string | null> {
  const { data: connection, error } = await supabase
    .from("tesla_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("device_id", deviceId)
    .maybeSingle<TeslaConnection>();

  if (error) {
    throw new Error(error.message);
  }

  if (!connection) {
    return null;
  }

  const expiresAt = new Date(connection.expires_at).getTime();

  if (
    Number.isFinite(expiresAt) &&
    expiresAt - Date.now() > 120_000
  ) {
    return connection.access_token;
  }

  const clientId = Deno.env.get("TESLA_CLIENT_ID");

  if (!clientId) {
    throw new Error("TESLA_CLIENT_ID is not configured");
  }

  const response = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: connection.refresh_token,
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      "Tesla token refresh failed:",
      response.status,
      responseText,
    );

    throw new Error(
      `Tesla token refresh failed (${response.status})`,
    );
  }

  let token: TeslaTokenResponse;

  try {
    token = JSON.parse(responseText) as TeslaTokenResponse;
  } catch {
    throw new Error("Tesla returned an invalid token response");
  }

  if (!token.access_token) {
    throw new Error(
      "Tesla token response did not include an access token",
    );
  }

  const expiresInSeconds =
    Number(token.expires_in) || 28_800;

  const { error: updateError } = await supabase
    .from("tesla_connections")
    .update({
      access_token: token.access_token,
      refresh_token:
        token.refresh_token ?? connection.refresh_token,
      expires_at: new Date(
        Date.now() + expiresInSeconds * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("device_id", deviceId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return token.access_token;
}