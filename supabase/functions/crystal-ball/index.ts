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
  const today = ukDate(now);
  let body: Record<string, unknown> = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const param = (k: string) => (body[k] as string | undefined) ?? url.searchParams.get(k) ?? undefined;
  
  const region = (param("region") || "F").toUpperCase();
  const requested = param("date");
  const targetDateStr = isDate(requested) ? requested : addDays(today, 1);

  try {
    const targetUrl = `https://agilerates.uk/api/agile_rates_region_${region}.json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const arRes = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json",
      },
    }).finally(() => clearTimeout(timeoutId));

    let estimates: any[] = [];

    if (arRes.ok) {
      const arData = await arRes.json();
      
      // Extract array from any possible structure in agile-rates.uk response
      let rawRates: any[] = [];
      if (Array.isArray(arData)) {
        rawRates = arData;
      } else if (arData && typeof arData === 'object') {
        rawRates = arData.rates || arData.results || arData.data || Object.values(arData).find(v => Array.isArray(v)) || [];
      }

      const parsed = rawRates.map((r: any) => {
        const validFromRaw = r.valid_from || r.time || r.from || r.timestamp || r.start;
        const validToRaw = r.valid_to || r.to || r.end;
        
        // Deeply check nested agileRate structure as well as flat properties
        const rateVal = 
          r.agileRate?.result?.rate ?? 
          r.rate?.value ?? 
          r.value_inc_vat ?? 
          r.rate ?? 
          r.pence_per_kwh ?? 
          r.value ?? 
          0;

        return {
          valid_from: validFromRaw,
          valid_to: validToRaw,
          value_inc_vat: Number(rateVal),
          value_exc_vat: Number(rateVal) / 1.2,
        };
      }).filter(r => r.valid_from);

      // 1. Try matching by target date string
      estimates = parsed.filter(r => String(r.valid_from).includes(targetDateStr));

      // 2. Fallback: If exact match fails but we have data, grab tomorrow's chunk (indices 48 to 96) or all available slots
      if (estimates.length === 0 && parsed.length > 0) {
        estimates = parsed.length >= 96 ? parsed.slice(48, 96) : parsed.slice(0, 48);
      }
    }

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
      error: err.message || "Failed to reach agile-rates.uk",
      updated_at: now.toISOString(),
      results: [],
      rates: [],
    });
  }
});
