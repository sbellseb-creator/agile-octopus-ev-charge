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
    // TODO: Insert your prediction / Nord Pool calculation logic here 
    // to generate estimated 48 half-hourly slots for targetDateStr instead of fetching official rates.
    
    // Example structure for predicted rates:
    const predictedEstimates = Array.from({ length: 48 }, (_, i) => {
      const hour = Math.floor(i / 2);
      const minute = i % 2 === 0 ? '00' : '30';
      const timeStr = `${targetDateStr}T${String(hour).padStart(2, '0')}:${minute}:00Z`;
      
      // Placeholder calculation / estimation formula based on time of day
      const baseRate = hour >= 16 && hour < 19 ? 35.0 : hour >= 2 && hour < 6 ? 5.0 : 18.0;

      return {
        valid_from: timeStr,
        valid_to: `${targetDateStr}T${String(minute === '30' ? hour + 1 : hour).padStart(2, '0')}:${minute === '30' ? '00' : '30'}:00Z`,
        value_inc_vat: Number(baseRate.toFixed(2)),
        value_exc_vat: Number((baseRate / 1.05).toFixed(2)),
      };
    });

    return json({
      date: targetDateStr,
      status: "available",
      available: true,
      region,
      estimated: true, // Mark as true so UI knows these are predictions
      source: "crystal-ball-prediction-model",
      is_mock: false,
      updated_at: now.toISOString(),
      results: predictedEstimates,
      rates: predictedEstimates,
    });
  } catch (err: any) {
    return json({
      date: targetDateStr,
      status: "waiting",
      available: false,
      region,
      estimated: true,
      error: err.message || "Failed to generate predictions",
      updated_at: now.toISOString(),
      results: [],
      rates: [],
    });
  }
});
