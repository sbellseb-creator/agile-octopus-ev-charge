const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { 
    status, 
    headers: { ...corsHeaders, "Content-Type": "application/json" } 
  });

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const now = new Date();
  
  // Calculate default target date (tomorrow)
  const tomorrowObj = new Date(now.valueOf() + 86400000);
  const defaultDate = tomorrowObj.toISOString().split("T")[0];

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    body = await req.json().catch(() => ({}));
  }
  const url = new URL(req.url);
  const param = (k: string) => (body[k] as string | undefined) ?? url.searchParams.get(k) ?? undefined;
  
  const region = (param("region") || "F").toUpperCase();
  const requested = param("date");
  const date = isDate(requested) ? requested : defaultDate;

  try {
    const targetUrl = `https://agilerates.uk/api/agile_rates_region_${region}.json`;

    // Strict 5-second fetch timeout to prevent browser hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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

    return json({
      date,
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
      date,
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
