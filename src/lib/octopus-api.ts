import { supabase } from "@/integrations/supabase/client";

export interface AgileRate {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string;
  is_forecast?: boolean;
}

/**
 * The edge runtime occasionally returns a transient 503
 * (SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED) or a dropped connection while it
 * cold-starts. Retry a few times with backoff before surfacing an error.
 */
async function invokeOctopus(queryString: string): Promise<AgileRate[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));

    const { data, error } = await supabase.functions.invoke("octopus-energy?" + queryString, {
      method: "GET",
    });

    if (!error) return (data?.results || []) as AgileRate[];

    lastError = error;
    const message = String((error as { message?: string })?.message ?? error);
    const transient = /503|degraded|temporarily unavailable|Failed to (send a request|fetch)|network/i.test(message);
    if (!transient) break;
  }

  const message = String((lastError as { message?: string })?.message ?? lastError);
  throw new Error(
    /503|degraded|temporarily unavailable/i.test(message)
      ? "Octopus rates are temporarily unavailable. Please try again in a moment."
      : message,
  );
}

export async function fetchAgileRates(tariffCode?: string, periodFrom?: string, periodTo?: string, region?: string): Promise<AgileRate[]> {
  const params: Record<string, string> = { action: "rates" };
  if (tariffCode) params.tariff_code = tariffCode;
  if (periodFrom) params.period_from = periodFrom;
  if (periodTo) params.period_to = periodTo;
  if (region) params.region = region;

  return invokeOctopus(new URLSearchParams(params).toString());
}

export async function fetchTrackerRates(tariffCode?: string, region?: string, periodFrom?: string, periodTo?: string): Promise<AgileRate[]> {
  const params: Record<string, string> = { action: "tracker" };
  if (tariffCode) params.tariff_code = tariffCode;
  if (region) params.region = region;
  if (periodFrom) params.period_from = periodFrom;
  if (periodTo) params.period_to = periodTo;

  return invokeOctopus(new URLSearchParams(params).toString());
}

/**
 *🔮 CRYSTAL BALL EARLY FORECAST ENGINE:
 * Fetches the wholesale day-ahead market auction prices immediately at 10:30 AM
 * and models the specific Octopus Agile Region F formula constraints.
 */
export async function fetchAgileEarlyForecast(): Promise<AgileRate[]> {
  try {
    const res = await fetch("https://elexon.co.uk");
    if (!res.ok) return [];
    const result = await res.json();
    if (!result.data || !Array.isArray(result.data)) return [];

    // Region F Loss and Distribution multipliers
    const REGIONAL_LOSS_FACTOR = 1.091;
    const DISTRIBUTION_CHARGE = 1.95;
    const VAT_MULTIPLIER = 1.05;

    return result.data.map((slot: any) => {
      const wholesalePenceKwh = slot.price / 10; // Convert GBP/MWh to p/kWh
      const start = new Date(slot.startTime);
      const hour = start.getHours();

      // Base Agile calculation
      let calculatedRate = (wholesalePenceKwh * REGIONAL_LOSS_FACTOR) + DISTRIBUTION_CHARGE;

      // Peak hour penalty (4:00 PM to 7:00 PM)
      if (hour >= 16 && hour < 19) {
        calculatedRate += 11.5;
      }

      // Final gross price with VAT applied
      const finalPrice = calculatedRate * VAT_MULTIPLIER;
      const roundedPrice = parseFloat(Math.min(100, Math.max(-30, finalPrice)).toFixed(2));

      return {
        value_exc_vat: parseFloat(calculatedRate.toFixed(2)),
        value_inc_vat: roundedPrice,
        valid_from: start.toISOString(),
        valid_to: new Date(start.getTime() + 30 * 60000).toISOString(),
        is_forecast: true
      };
    });
  } catch {
    return [];
  }
}
