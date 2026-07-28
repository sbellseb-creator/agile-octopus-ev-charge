import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getAuthedUserId, logEvent, safeMessage, serviceClient } from "../_shared/auth.ts";
import { getConnection, getValidAccessToken } from "../_shared/tesla.ts";

const FN = "tesla-refresh-token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const userId = await getAuthedUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const supabase = serviceClient();
    const conn = await getConnection(supabase, userId);
    if (!conn) return json({ connected: false });

    await getValidAccessToken(supabase, conn);
    logEvent(FN, "token_ok", { userId });
    return json({ connected: true });
  } catch (e) {
    logEvent(FN, "unhandled_error", { message: safeMessage(e) }, "error");
    return json({ error: safeMessage(e) }, 500);
  }
});
