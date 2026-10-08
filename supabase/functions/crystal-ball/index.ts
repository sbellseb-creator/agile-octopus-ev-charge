import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { addDays, ukDate } from "../_shared/agile-core.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Fetch with an explicit 8-second timeout so it never hangs for a minute
async function fetchWithTimeout(resource: string, options: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const now = new Date();
  const today = ukDate(now);
  let body: Record<string, unknown> = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const param = (k: string) => (body[k] as string | undefined) ?? url.searchParams.get(k) ?? undefined;
  const region = (param("region") || Deno.env.get("AGILE_REGION") || "F").toUpperCase();
  const requested = param("date");
  const date = isDate(requested) ? requested : addDays(today, 1);

  try {
    let estimates: any[] = [];
    let providerLabel = "agile-rates.uk";

    // 1. Primary Attempt: Direct fetch from agilerates.uk API
    try {
      const targetUrl = `https://agilerates.uk/api/agile_rates_region_${region}.json`;
      const arRes = await fetchWithTimeout(targetUrl, {
        headers: {
          "Accept": "application/json, text/plain, */*",
          "User-Agent": "AgileChargeApp/1.0",
        },
      }, 7000);

      if (arRes.ok) {
        const arData = await arRes.json();
        const rawRates = Array.isArray(arData) ? arData : (arData?.rates || []);

        estimates = rawRates
          .filter((r: any) => {
            const validFrom = r.valid_from || r.time || r.from || r.timestamp;
            return validFrom && validFrom.startsWith(date);
          })
          .map((r: any) => {
            const validFrom = r.valid_from || r.time || r.from || r.timestamp;
            const validTo = r.valid_to || r.to;
            const rate = r.agileRate?.result?.rate ?? r.value_inc_vat ?? r.rate ?? r.pence_per_kwh ?? 0;
            return {
              valid_from: validFrom,
              valid_to: validTo,
              value_inc_vat: Number(rate),
              value_exc_vat: Number(rate) / 1.2,
            };
          });
      }
    } catch (err) {
      console.warn("agilerates.uk fetch failed or timed out:", err);
    }

    // Return structured payload expected by AgileCrystalBall.tsx
    return json({
      date,
      status: estimates.length > 0 ? "available" : "waiting",
      available: estimates.length > 0,
      region,
      estimated: true,
      source: providerLabel,
      is_mock: false,
      updated_at: now.toISOString(),
      results: estimates,
      rates: estimates,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({
      date,
      status: "error",
      available: false,
      region,
      estimated: true,
      error: message,
      error_reason: "fetch_failed",
      updated_at: now.toISOString(),
      results: [],
      rates: [],
    });
  }
});
