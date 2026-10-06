import { supabase } from "@/integrations/supabase/client";
import { fetchAgileRates } from "@/lib/octopus-api";
import { AGILE_REGION } from "@/lib/agile-config";
import { addDays, slotsForUkDate, ukMidnightUtc, type PriceSlot } from "@/lib/crystal-ball-utils";

export interface CrystalBallEstimate {
  date: string;
  status: "available" | "waiting" | "error";
  available: boolean;
  error?: string;
  error_reason?: string;
  source: string;
  is_mock: boolean;
  updated_at: string;
  results: PriceSlot[];
}

async function invokeCrystal<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("crystal-ball", { method: "POST", body: { region: AGILE_REGION, ...body } });
  if (error) throw new Error(String((error as { message?: string }).message ?? error));
  return data as T;
}

export const fetchCrystalBall = (date?: string) => invokeCrystal<CrystalBallEstimate>(date ? { date } : {});

export interface CrystalDiagnostic {
  provider: string;
  verdict: { verdict: "ok" | "provider_wrong" | "provider_failing"; message: string };
  checks: Array<{ date: string; rows: number; status: "data" | "empty" | "error"; reason?: string }>;
  accuracy: Array<{ date: string; compared?: number; average_diff?: number | null; mean_abs_error?: number | null; error?: string }>;
  fitted_formula: { multiplier: number; peakAdder: number; samples: number } | null;
}

export const fetchCrystalDiagnostic = () => invokeCrystal<CrystalDiagnostic>({ diagnose: true, days: 7 });

export async function fetchOfficialForDate(date: string): Promise<PriceSlot[]> {
  const from = ukMidnightUtc(date).toISOString();
  const to = ukMidnightUtc(addDays(date, 1)).toISOString();
  const rates = await fetchAgileRates(undefined, from, to, AGILE_REGION);
  return slotsForUkDate(rates, date).map((r) => ({ valid_from: r.valid_from, valid_to: r.valid_to, value_inc_vat: r.value_inc_vat }));
}
