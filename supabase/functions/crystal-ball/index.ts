import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  type FitSample, addDays, agilePriceFromWholesale, isPeakSlot, ukDate, ukMidnightUtc,
} from "../_shared/agile-core.ts";
import { estimateFromWholesale, formulaFromEnv, getProvider } from "../_shared/crystal-provider.ts";
import {
  type DayCheck, ProviderError, checkDays, compareEstimateToOfficial, diagnosePreviousDays, fitFormula,
} from "../_shared/crystal-status.ts";
import { fetchOfficialRates } from "../_shared/octopus-official.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Previous-days diagnostic: does the provider return data for settled days, and
 * how close is the formula to the official Agile rates? Also suggests formula
 * constants fitted to the official rates (never applied automatically).
 */
async function diagnose(region: string, today: string, days: number) {
  const cfg = formulaFromEnv();
  const previousDates = Array.from({ length: days }, (_, i) => addDays(today, -(i + 1)));
  const tomorrow = addDays(today, 1);
  const choice = Deno.env.get("CRYSTAL_PROVIDER");
  const provider = getProvider(choice, previousDates[0], today);
  const tomorrowProvider = getProvider(choice, tomorrow, today);
  const tomorrowCheck = (await checkDays((d) => tomorrowProvider.fetchDay(d), [tomorrow]))[0];

  // Fetch each previous day once (in parallel) and reuse it for the check and the accuracy comparison.
  const fetched = await Promise.all(previousDates.map(async (date) => {
    try {
      return { date, wholesale: await provider.fetchDay(date), error: null as string | null };
    } catch (e) {
      return { date, wholesale: [], error: e instanceof Error ? e.message : String(e) };
    }
  }));
  const previous = fetched.map((f): DayCheck => f.error
    ? { date: f.date, rows: 0, status: "error", reason: f.error }
    : { date: f.date, rows: f.wholesale.length, status: f.wholesale.length ? "data" : "empty" });
  const verdict = diagnosePreviousDays(previous);

  const samples: FitSample[] = [];
  const perDay = await Promise.all(fetched.map(async (f) => {
    if (f.error) return { date: f.date, error: f.error };
    try {
      const official = await fetchOfficialRates(ukMidnightUtc(f.date).toISOString(), ukMidnightUtc(addDays(f.date, 1)).toISOString(), region);
      const est = f.wholesale.map((w) => ({ valid_from: w.valid_from, valid_to: w.valid_to, value_inc_vat: agilePriceFromWholesale(w.pence_per_kwh, new Date(w.valid_from), cfg) }));
      const cmp = compareEstimateToOfficial(est, official);
      const offMap = new Map(official.map((o) => [o.valid_from, o.value_inc_vat]));
      for (const w of f.wholesale) {
        const o = offMap.get(w.valid_from);
        if (o !== undefined) samples.push({ wholesale: w.pence_per_kwh, official: o, peak: isPeakSlot(new Date(w.valid_from), cfg) });
      }
      return { date: f.date, wholesale_rows: f.wholesale.length, official_rows: official.length, compared: cmp.compared, average_diff: cmp.averageDiff, mean_abs_error: cmp.meanAbsDiff };
    } catch (e) {
      return { date: f.date, error: e instanceof Error ? e.message : String(e) };
    }
  }));
  const fitted = fitFormula(samples, cfg.vatFactor, cfg.cap, cfg.floor);
  return { provider: provider.label, region, formula: cfg, checks: [...previous, tomorrowCheck], verdict, accuracy: perDay, fitted_formula: fitted };
}

// Estimated (NOT official) Agile rates for one UK delivery day, computed from
// wholesale data + the Agile formula. The browser only ever calls this function.
// Always answers 200 with status "available" | "waiting" | "error" so the UI can show the real reason.
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
    if (param("diagnose")) {
      const days = Math.min(7, Math.max(1, Number(param("days")) || 7));
      const result = await diagnose(region, today, days);
      console.log(JSON.stringify({ fn: "crystal-ball", event: "diagnose", provider: result.provider, verdict: result.verdict.verdict, checks: result.checks }));
      return json({ diagnostic: true, ...result });
    }

    const choice = param("provider") === "neso" ? "neso" : Deno.env.get("CRYSTAL_PROVIDER");
    const provider = getProvider(choice, date, today);
    const cfg = formulaFromEnv();
    const wholesale = await provider.fetchDay(date);
    const estimates = estimateFromWholesale(wholesale, cfg);
    console.log(JSON.stringify({
      fn: "crystal-ball", provider: provider.id, date,
      range: [ukMidnightUtc(date).toISOString(), ukMidnightUtc(addDays(date, 1)).toISOString()],
      rows: estimates.length, failure: null,
    }));
    return json({
      date, status: estimates.length > 0 ? "available" : "waiting", available: estimates.length > 0, region, estimated: true,
      source: provider.label, is_mock: provider.isMock, updated_at: now.toISOString(), formula: cfg, results: estimates, wholesale,
    });
  } catch (e) {
    const reason = e instanceof ProviderError ? e.reason : "internal_error";
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ fn: "crystal-ball", date, rows: 0, failure: reason, message }));
    return json({ date, status: "error", available: false, region, estimated: true, error: message, error_reason: reason, updated_at: now.toISOString(), results: [] });
  }
});
