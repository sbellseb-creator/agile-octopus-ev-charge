import { supabase } from "@/integrations/supabase/client";

export interface AgileRate {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string;
}

export async function fetchAgileRates(tariffCode?: string, periodFrom?: string, periodTo?: string, region?: string): Promise<AgileRate[]> {
  const params: Record<string, string> = { action: "rates" };
  if (tariffCode) params.tariff_code = tariffCode;
  if (periodFrom) params.period_from = periodFrom;
  if (periodTo) params.period_to = periodTo;
  if (region) params.region = region;

  const queryString = new URLSearchParams(params).toString();

  const { data, error } = await supabase.functions.invoke("octopus-energy?" + queryString, {
    method: "GET",
  });

  if (error) throw error;
  return (data?.results || []) as AgileRate[];
}


export async function fetchTrackerRates(tariffCode?: string, region?: string, periodFrom?: string, periodTo?: string): Promise<AgileRate[]> {
  const params: Record<string, string> = { action: "tracker" };
  if (tariffCode) params.tariff_code = tariffCode;
  if (region) params.region = region;
  if (periodFrom) params.period_from = periodFrom;
  if (periodTo) params.period_to = periodTo;

  const queryString = new URLSearchParams(params).toString();

  const { data, error } = await supabase.functions.invoke("octopus-energy?" + queryString, {
    method: "GET",
  });

  if (error) throw error;
  return (data?.results || []) as AgileRate[];
}
