import { supabase } from "@/integrations/supabase/client";

export interface AgileRate {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string;
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(
    "octopus-energy",
    {
      body,
    },
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

export async function fetchAgileRates(
  productCode?: string,
  periodFrom?: string,
  periodTo?: string,
  region?: string,
): Promise<AgileRate[]> {
  const data = await invoke({
    action: "rates",
    productCode,
    periodFrom,
    periodTo,
    region,
  });

  return (data.results ?? []) as AgileRate[];
}

export async function fetchTrackerRates(
  productCode?: string,
  region?: string,
  periodFrom?: string,
  periodTo?: string,
): Promise<AgileRate[]> {
  const data = await invoke({
    action: "tracker",
    productCode,
    region,
    periodFrom,
    periodTo,
  });

  return (data.results ?? []) as AgileRate[];
}

export async function verifyOctopusAccount(
  apiKey: string,
  accountNumber: string,
) {
  return invoke({
    action: "verify-account",
    apiKey,
    accountNumber,
  });
}

export async function fetchRegions() {
  const data = await invoke({
    action: "regions",
  });

  return data.regions;
}