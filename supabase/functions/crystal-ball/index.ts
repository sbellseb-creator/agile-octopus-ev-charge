import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { addDays, ukDate } from "../_shared/agile-core.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { 
    status, 
    headers: { ...corsHeaders, "Content-Type": "application/json" } 
  });

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const now = new Date();
  const ukHour = parseInt(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }), 10);
  const today = ukDate(now);

  let body: Record<string, unknown> = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const param = (k: string) => (body[k] as string | undefined) ?? url.searchParams.get(k) ?? undefined;
  
  const region = (param("region") || "F").toUpperCase();
  const requested = param("date");

  let targetDateStr = today;
  if (isDate(requested)) {
    targetDateStr = requested;
  } else {
    if (ukHour >= 10) {
      targetDateStr = addDays(today, 1);
    }
  }

  try {
    const targetUrl = `https://agile-rates.uk/api/v2/archive?date=${targetDateStr}&region=${region}`;

    const res = await fetch(targetUrl, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`agile-rates.uk API error: HTTP ${res.status}`);
    }

    const data = await res.json();
    
    // Check all possible keys in order of likelihood to catch whichever array contains the rate slots
    const rawSlots = 
      data.import_actuals_tomorrow || 
      data.import_predictions_tomorrow || 
      data.import_actuals_today || 
      data.import_predictions_today || 
      data.rates || [];

    const estimates = Array.isArray(rawSlots) ? rawSlots.map((r: any) => {
      const rateVal = r.rates?.[region] ?? r.rate ?? 0;
      return {
        valid_from: r.start || r.valid_from,
        valid_to: r.end || r.valid_to,
        value_inc_vat: Number(rateVal),
        value_exc_vat: Number((Number(rateVal) / 1.05).toFixed(2)),
      };
    }) : [];

    // Sort chronologically from 00:00 onwards
    estimates.sort((a, b) => new Date(a.valid_from).getTime() - new Date(b.valid_from).getTime());

    return json({
      date: targetDateStr,
      status: estimates.length > 0 ? "available" : "waiting",
      available: estimates.length > 0,
      region,
      estimated: true,
      source: "agile-rates.uk",
      is_mock: false,
      updated_at: now.toISOString(),
      results: estimates,
      rates: estimates,
    });
  } catch (err: any) {
    return json({
      date: targetDateStr,
      status: "waiting",
      available: false,
      region,
      estimated: true,
      error: err.message || "Failed to fetch from agile-rates.uk",
      updated_at: now.toISOString(),
      results: [],
      rates: [],
    });
  }
});
