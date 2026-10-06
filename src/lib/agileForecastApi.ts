/**
 * Browser-side fetchers for Agile Crystal Ball. Public, keyless, CORS-enabled APIs only.
 */
import type { WholesalePoint } from "@/lib/agileForecast";
import { AGILE_REGION_CODE } from "@/lib/agileForecast";

const ELEXON_MID = "https://data.elexon.co.uk/bmrs/api/v1/datasets/MID";
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

/** Day-ahead auction prices (N2EX GB via Nord Pool), £/MWh, expanded to half-hour points. */
export async function fetchDayAheadNordPool(dateKey: string): Promise<WholesalePoint[]> {
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

/** Elexon MID (EPEX GB index). Only published for periods that have already happened, so a fallback. */
export async function fetchElexonMid(fromIso: string, toIso: string): Promise<WholesalePoint[]> {
  const qs = new URLSearchParams({ from: fromIso, to: toIso, format: "json" });
  const json = await getJson(`${ELEXON_MID}?${qs}`);
  const rows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const apx = rows.filter((r) => r?.dataProvider === "APXMIDP");
  return (apx.length > 0 ? apx : rows)
    .filter((r) => r && typeof r.startTime === "string" && typeof r.price === "number")
    .map((r) => ({ start: new Date(r.startTime).toISOString(), pricePerMwh: r.price as number }));
}

/** Tries day-ahead sources in order; never throws. Returns points plus per-source diagnostics. */
export async function fetchWholesale(
  dateKey: string,
  fromIso: string,
  toIso: string,
): Promise<{ points: WholesalePoint[]; attempts: SourceAttempt[] }> {
  const sources: [string, () => Promise<WholesalePoint[]>][] = [
    ["Nord Pool N2EX day-ahead", () => fetchDayAheadNordPool(dateKey)],
    ["Elexon market index (MID)", () => fetchElexonMid(fromIso, toIso)],
  ];
  const attempts: SourceAttempt[] = [];
  for (const [source, fn] of sources) {
    try {
      const points = await fn();
      attempts.push({
        source, ok: true, points: points.length,
        detail: points.length ? "data returned" : "responded but no prices published for this date yet",
      });
      if (points.length) return { points, attempts };
    } catch (e) {
      attempts.push({ source, ok: false, points: 0, detail: `request failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return { points: [], attempts };
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
