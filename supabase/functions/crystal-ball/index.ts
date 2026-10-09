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
    // Construct official Octopus Energy product & tariff codes for Agile
    // Using current Agile tariff code structure
    const productCode = "AGILE-24-10-01";
    const tariffCode = `E-1R-${productCode}-${region}`;
    
    // Request period covering the target date
    const periodFrom = `${targetDateStr}T00:00:00Z`;
    const periodTo = `${targetDateStr}T23:59:59Z`;
    
    const targetUrl = `https://api.octopus.energy/v1/products/${productCode}/electricity-tariffs/${tariffCode}/standard-unit-rates/?period_from=${periodFrom}&period_to=${periodTo}`;

    const ocRes = await fetch(targetUrl, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!ocRes.ok) {
      throw new Error(`Octopus API error: HTTP ${ocRes.status}`);
    }

    const ocData = await ocRes.json();
    const results = ocData.results || [];

    // Map Octopus results to the app's expected rate format
    const estimates = results.map((r: any) => ({
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      value_inc_vat: Number(r.value_inc_vat),
      value_exc_vat: Number(r.value_exc_vat),
    }));

    return json({
      date: targetDateStr,
      status: estimates.length > 0 ? "available" : "waiting",
      available: estimates.length > 0,
      region,
      estimated: true,
      source: "octopus-energy-api",
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
      error: err.message || "Failed to fetch from Octopus API",
      updated_at: now.toISOString(),
      results: [],
      rates: [],
    });
  }
});
