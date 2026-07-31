import { serve } from "https://deno.land/std/http/server.ts";

serve(async () => {
  return new Response(
    JSON.stringify({
      success: true,
      message: "LOCAL TEST FUNCTION",
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
});