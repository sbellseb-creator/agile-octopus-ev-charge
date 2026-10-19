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
    const targetUrl = `https://agile-rates.uk/api/v2/current`;
    const res = await fetch(targetUrl, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`agile-rates.uk API error: HTTP ${res.status}`);
    }

    const data = await res.json();
    
    // Traverse v2 regional response structures safely
    const regionsMap = data.regions || data.data || data;
    const regionObj = regionsMap[region] || regionsMap[region.toLowerCase()] || data[region] || {};
    
    const tomorrowBlock = regionObj.tomorrow || data.tomorrow || {};
    const rawSlots = tomorrowBlock.rates || regionObj.rates || data.rates || [];

    const estimates = Array.isArray(rawSlots) ? rawSlots.map((r: any) => {
      const rateVal = r.value_inc_vat ?? r.valueIncVat ?? r.rate ?? r.value ?? 0;
      return {
        valid_from: r.valid_from || r.validFrom || r.from || r.start,
        valid_to: r.valid_to || r.validTo || r.to || r.end,
        value_inc_vat: Number(rateVal),
        value_exc_vat: r.value_exc_vat ?? r.valueExcVat ? Number(r.value_exc_vat ?? r.valueExcVat) : Number((Number(rateVal) / 1.05).toFixed(2)),
      };
    }).filter(r => r.valid_from && !isNaN(r.value_inc_vat)) : [];

    estimates.sort((a, b) => new Date(a.valid_from).getTime() - new Date(b.valid_from).getTime());

    return json({
      date: tomorrowBlock.date || targetDateStr,
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
