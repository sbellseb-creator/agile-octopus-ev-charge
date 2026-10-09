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
    // Pass the required query parameters correctly to agile-rates.uk
    const targetUrl = `https://agile-rates.uk/api/v2/archive?date=${targetDateStr}&region=${region}`;

    const res = await fetch(targetUrl, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`agile-rates.uk API error: HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawRates = data.rates || data.results || data.data || [];

    const estimates = Array.isArray(rawRates) ? rawRates.map((r: any) => ({
      valid_from: r.valid_from || r.from || r.time,
      valid_to: r.valid_to || r.to,
      value_inc_vat: Number(r.value_inc_vat ?? r.rate ?? 0),
      value_exc_vat: Number((r.value_exc_vat ?? (Number(r.value_inc_vat ?? r.rate ?? 0) / 1.05)).toFixed(2)),
    })) : [];

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
