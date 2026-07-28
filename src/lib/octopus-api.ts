import { supabase } from "@/integrations/supabase/client";

export interface AgileRate {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string;
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
