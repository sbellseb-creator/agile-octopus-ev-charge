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
      
      let rawRates: any[] = [];
      if (Array.isArray(arData)) {
        rawRates = arData;
      } else if (arData && typeof arData === 'object') {
        const foundKey = Object.keys(arData).find(k => Array.isArray(arData[k]));
        if (foundKey) rawRates = arData[foundKey];
      }

      const parsed = rawRates.map((r: any) => {
        const validFromRaw = r.valid_from || r.time || r.from || r.timestamp;
        const validToRaw = r.valid_to || r.to;
        
        // Comprehensive check for rate values across different API versions
        const rateVal = 
          r.value_inc_vat ?? 
          r.rate ?? 
          r.pence_per_kwh ?? 
          r.value ?? 
          r.agileRate?.result?.rate ?? 
          r.tariff_rate ?? 
          0;

        const dateObj = validFromRaw ? new Date(validFromRaw) : null;
        
        return {
          valid_from: validFromRaw,
          valid_to: validToRaw,
          value_inc_vat: Number(rateVal),
          value_exc_vat: Number(rateVal) / 1.2,
          timestampMs: dateObj && !isNaN(dateObj.getTime()) ? dateObj.getTime() : null,
        };
      });

      // Filter strictly for the target date string
      estimates = parsed.filter((r) => {
        if (r.valid_from && typeof r.valid_from === 'string') {
          return r.valid_from.includes(targetDateStr);
        }
        if (r.timestampMs !== null) {
          const slotDateStr = new Date(r.timestampMs).toISOString().split('T')[0];
          return slotDateStr === targetDateStr;
        }
        return false;
      });

      // Fallback: If exact date match is empty, take the next 48 slots as the published tomorrow set
      if (estimates.length === 0 && parsed.length > 0) {
        estimates = parsed.slice(0, 48);
      }

      estimates = estimates.map(({ timestampMs, ...rest }) => rest);
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
