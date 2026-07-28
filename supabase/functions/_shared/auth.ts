import { createClient } from "npm:@supabase/supabase-js@2";

/** Structured, token-safe server logging. Never log tokens, codes or PII. */
export function logEvent(
  fn: string,
  event: string,
  fields: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/token|secret|code|verifier|password|vin|authorization/i.test(k)) continue;
    safe[k] = typeof v === "string" && v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  const line = JSON.stringify({ fn, event, level, ts: new Date().toISOString(), ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Redact an error before it leaves the server. */
export function safeMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : "Unexpected error";
  return raw.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]");
}

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/**
 * Verify the caller's JWT. Returns the authenticated user id, or null when the
 * request is unauthenticated / the token is invalid.
 */
export async function getAuthedUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}
