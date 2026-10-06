import { supabase } from "@/integrations/supabase/client";
import { fetchAgileRates } from "@/lib/octopus-api";
import { AGILE_REGION } from "@/lib/agile-config";
import { addDays, slotsForUkDate, ukMidnightUtc, type PriceSlot } from "@/lib/crystal-ball-utils";

export interface CrystalBallEstimate {
  date: string;
  source: string;
  is_mock: boolean;
  updated_at: string;
  results: PriceSlot[];
}

export async function fetchCrystalBall(date?: string): Promise<CrystalBallEstimate> {
  const params = new URLSearchParams({ region: AGILE_REGION });
  if (date) params.set("date", date);
  const { data, error } = await supabase.functions.invoke(`crystal-ball?${params.toString()}`, { method: "GET" });
  if (error) throw new Error(String((error as { message?: string }).message ?? error));
  return data as CrystalBallEstimate;
}

export async function fetchOfficialForDate(date: string): Promise<PriceSlot[]> {
  const from = ukMidnightUtc(date).toISOString();
  const to = ukMidnightUtc(addDays(date, 1)).toISOString();
  const rates = await fetchAgileRates(undefined, from, to, AGILE_REGION);
  return slotsForUkDate(rates, date).map((r) => ({ valid_from: r.valid_from, valid_to: r.valid_to, value_inc_vat: r.value_inc_vat }));
}
