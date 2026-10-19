import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { 
    status, 
    headers: { ...corsHeaders, "Content-Type": "application/json" } 
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: Record<string, unknown> = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const param = (k: string) => (body[k] as string | undefined) ?? url.searchParams.get(k) ?? undefined;
  
  const region = (param("region") || "F").toUpperCase();

  try {
    // Fetch directly from the official region JSON endpoint which holds tomorrow's full prediction feed
    const targetUrl = `https://agilerates.uk/api/agile_rates_region_${region}.json`;
    const res = await fetch(targetUrl, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`agile-rates.uk API error: HTTP ${res.status}`);
    }

    const data = await res.json();
    
    const targetDate = data?.tradingDate?.date || data?.date || "Tomorrow";
    const rawSlots = data?.rates || data?.data?.rates || [];

    const estimates = Array.isArray(rawSlots) ? rawSlots.map((r: any) => {
      // Correctly extract price from the nested schema structure
      const rateVal = r.agileRate?.result?.rate ?? r.value_inc_vat ?? r.rate ?? r.value ?? 0;
      return {
        valid_from: r.valid_from || r.from || r.start || r.deliveryStart,
        valid_to: r.valid_to || r.to || r.end || r.deliveryEnd,
        value_inc_vat: Number(rateVal),
        value_exc_vat: Number((Number(rateVal) / 1.05).toFixed(2)),
      };
    }).filter(r => r.valid_from && !isNaN(r.value_inc_vat)) : [];

    // Ensure chronological sorting from 00:00 onwards
    estimates.sort((a, b) => new Date(a.valid_from).getTime() - new Date(b.valid_from).getTime());

    return json({
      date: targetDate,
      status: estimates.length > 0 ? "available" : "waiting",
      available: estimates.length > 0,
      region,
      estimated: true,
      source: "agile-rates.uk",
      results: estimates,
      rates: estimates,
    });
  } catch (err: any) {
    return json({
      status: "waiting",
      available: false,
      region,
      error: err.message || "Failed to fetch from agile-rates.uk",
      results: [],
      rates: [],
    });
  }
});
