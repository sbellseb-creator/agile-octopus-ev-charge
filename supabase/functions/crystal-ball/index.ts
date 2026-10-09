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
        const validFromRaw = r.valid_from || r.time || r.from || r.timestamp || r.start;
        const validToRaw = r.valid_to || r.to || r.end;
        
        const rateVal = 
          r.agileRate?.result?.rate ?? 
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

      // 1. Try exact match
      estimates = parsed.filter(r => String(r.valid_from).includes(targetDateStr));

      // 2. Fallback: Group by date and pick tomorrow's block
      if (estimates.length === 0 && parsed.length > 0) {
        const dateMap = new Map<string, any[]>();
        for (const item of parsed) {
          const dStr = String(item.valid_from).substring(0, 10);
          if (!dateMap.has(dStr)) dateMap.set(dStr, []);
          dateMap.get(dStr)!.push(item);
        }

        if (dateMap.has(targetDateStr)) {
          estimates = dateMap.get(targetDateStr)!;
        } else {
          const sortedDates = Array.from(dateMap.keys()).sort();
          if (sortedDates.length >= 2) {
            estimates = dateMap.get(sortedDates[1]) || parsed.slice(48, 96);
          } else {
            estimates = parsed.slice(0, 48);
          }
        }
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
