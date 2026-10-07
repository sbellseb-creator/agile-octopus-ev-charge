/**
 * Browser-side fetchers for Agile Crystal Ball. Public, keyless, CORS-enabled APIs only.
 */
import type { WholesalePoint } from "@/lib/agileForecast";
import { AGILE_REGION_CODE, addDaysToDateKey } from "@/lib/agileForecast";

const OCTOPUS = "https://api.octopus.energy/v1";

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

const NORDPOOL_DA = "https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices";

export interface SourceAttempt {
  source: string;
  ok: boolean;
  points: number;
  detail: string;
}

async function fetchNordPoolDate(dateKey: string): Promise<WholesalePoint[]> {
  const qs = new URLSearchParams({ date: dateKey, market: "DayAhead", deliveryArea: "UK", currency: "GBP" });
  const json = await getJson(`${NORDPOOL_DA}?${qs}`);
  const entries: any[] = Array.isArray(json?.multiAreaEntries) ? json.multiAreaEntries : [];
  const out: WholesalePoint[] = [];
  for (const e of entries) {
    const price = e?.entryPerArea?.UK;
    const t0 = new Date(e?.deliveryStart).getTime();
    const t1 = new Date(e?.deliveryEnd).getTime();
    if (typeof price !== "number" || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) continue;
    for (let t = t0; t < t1; t += 30 * 60 * 1000) out.push({ start: new Date(t).toISOString(), pricePerMwh: price });
  }
  return out;
}

/**
 * Day-ahead auction prices (N2EX GB via Nord Pool), £/MWh, expanded to half-hour points.
 * Nord Pool delivery days run on CET, so the final UK hour of a UK day sits in the following
 * delivery day: both are requested in parallel (two requests for the whole day, never per slot).
 */
export async function fetchDayAheadNordPool(dateKey: string): Promise<WholesalePoint[]> {
  const [main, next] = await Promise.all([
    fetchNordPoolDate(dateKey),
    fetchNordPoolDate(addDaysToDateKey(dateKey, 1)).catch(() => [] as WholesalePoint[]),
  ]);
  return [...main, ...next];
}

/**
 * Whole-day wholesale prices in one pass. Only the day-ahead auction is used: it publishes the full
 * day at once, whereas Elexon MID only exists for periods already elapsed and would make the chart
 * fill in slot by slot. Never throws.
 */
export async function fetchWholesale(dateKey: string): Promise<{ points: WholesalePoint[]; attempts: SourceAttempt[] }> {
  const attempts: SourceAttempt[] = [];
  try {
    const points = await fetchDayAheadNordPool(dateKey);
    attempts.push({
      source: "Nord Pool N2EX day-ahead", ok: true, points: points.length,
      detail: points.length ? "data returned" : "responded but no prices published for this date yet",
    });
    if (points.length) return { points, attempts };
  } catch (e) {
    attempts.push({ source: "Nord Pool N2EX day-ahead", ok: false, points: 0, detail: `request failed: ${e instanceof Error ? e.message : String(e)}` });
  }
  // Browser may be blocked from Nord Pool (CORS): try the same-origin snapshot written by CI.
  try {
    const points = await fetchStaticSnapshot(dateKey);
    attempts.push({ source: "Static snapshot", ok: true, points: points.length, detail: points.length ? "data returned" : "no snapshot for this date" });
    return { points, attempts };
  } catch (e) {
    attempts.push({ source: "Static snapshot", ok: false, points: 0, detail: `request failed: ${e instanceof Error ? e.message : String(e)}` });
    return { points: [], attempts };
  }
}

/** Same-origin JSON written by scripts/fetch-nordpool.mjs (scheduled GitHub Action). */
async function fetchStaticSnapshot(dateKey: string): Promise<WholesalePoint[]> {
  const json = await getJson(`${import.meta.env.BASE_URL}data/nordpool.json`);
  const pts = json?.days?.[dateKey];
  return Array.isArray(pts) ? (pts as WholesalePoint[]) : [];
}

/** Discover the current (open-to-new-customers) Agile product code. */
export async function fetchAgileProductCode(): Promise<string | null> {
  const json = await getJson(`${OCTOPUS}/products/?brand=OCTOPUS_ENERGY&is_business=false`);
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  const agile = results
    .filter((p) => typeof p?.code === "string" && /^AGILE-(?!OUTGOING)/.test(p.code) && !p.available_to)
    .sort((a, b) => String(b.available_from ?? "").localeCompare(String(a.available_from ?? "")));
  return agile[0]?.code ?? null;
}

export async function fetchOfficialRates(
  fromIso: string,
  toIso: string,
): Promise<{ valid_from: string; value_inc_vat: number }[]> {
  const product = await fetchAgileProductCode();
  if (!product) return [];
  const qs = new URLSearchParams({ period_from: fromIso, period_to: toIso, page_size: "100" });
  const json = await getJson(
    `${OCTOPUS}/products/${product}/electricity-tariffs/E-1R-${product}-${AGILE_REGION_CODE}/standard-unit-rates/?${qs}`,
  );
  return Array.isArray(json?.results) ? json.results : [];
}
