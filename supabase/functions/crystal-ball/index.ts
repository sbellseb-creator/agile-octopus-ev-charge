import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { addDays, parseFormulaOverrides, ukDate } from "../_shared/agile-core.ts";
import { estimateAgileDay, getProvider } from "../_shared/crystal-provider.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Estimated (NOT official) Agile rates for one UK delivery day, computed from
// wholesale data + the Agile formula. The browser only ever calls this function.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const region = (url.searchParams.get("region") || Deno.env.get("AGILE_REGION") || "F").toUpperCase();
    const requested = url.searchParams.get("date");
    const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : addDays(ukDate(new Date()), 1);

    const provider = getProvider(Deno.env.get("CRYSTAL_PROVIDER"));
    const cfg = parseFormulaOverrides({
      AGILE_MULTIPLIER: Deno.env.get("AGILE_MULTIPLIER"),
      AGILE_PEAK_ADDER: Deno.env.get("AGILE_PEAK_ADDER"),
      AGILE_PEAK_START_HOUR: Deno.env.get("AGILE_PEAK_START_HOUR"),
      AGILE_PEAK_END_HOUR: Deno.env.get("AGILE_PEAK_END_HOUR"),
      AGILE_VAT_FACTOR: Deno.env.get("AGILE_VAT_FACTOR"),
      AGILE_CAP: Deno.env.get("AGILE_CAP"),
      AGILE_FLOOR: Deno.env.get("AGILE_FLOOR"),
    });
    const estimates = await estimateAgileDay(provider, date, cfg);

    return json({
      date,
      available: estimates.length > 0,
      region,
      estimated: true,
      source: provider.label,
      is_mock: provider.isMock,
      updated_at: new Date().toISOString(),
      formula: cfg,
      results: estimates,
    });
  } catch (e) {
    console.error("crystal-ball error", e instanceof Error ? e.message : e);
    return json({ error: "Estimates are temporarily unavailable" }, 502);
  }
});
