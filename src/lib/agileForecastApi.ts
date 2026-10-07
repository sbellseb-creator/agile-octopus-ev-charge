/**
 * Browser-side fetchers for Agile Crystal Ball. Public, keyless, CORS-enabled APIs only.
 */
import type { WholesalePoint } from "@/lib/agileForecast";
import { AGILE_REGION_CODE, SLOT_MS } from "@/lib/agileForecast";

const ELEXON_MID = "https://data.elexon.co.uk/bmrs/api/v1/datasets/MID";
const OCTOPUS = "https://api.octopus.energy/v1";

/** Fetch and parse JSON defensively: HTML (e.g. a SPA fallback page) fails with a readable error. */
async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!/json/i.test(contentType) || /^\s*</.test(text)) {
    throw new Error(`Response was not JSON (${contentType || "unknown content-type"})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response was not JSON (${res.headers.get("content-type") ?? "unknown content-type"})`);
  }
}

const NORDPOOL_DA = "https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices";
/** Nord Pool market names tried for the GB half-hour auction (area UK, GBP). */
export const NORDPOOL_MARKETS = ["DayAhead", "N2EX_DayAhead"];

export interface SourceAttempt {
  source: string;
  ok: boolean;
  points: number;
  detail: string;
}

/**
 * Parse a Nord Pool DayAheadPrices payload (multiAreaEntries, GBP/MWh, delivery times in UTC/GMT)
 * into half-hour wholesale points. Hourly entries are expanded to two half-hours.
 */
export function parseNordPoolPayload(json: any): WholesalePoint[] {
  const entries: any[] = Array.isArray(json?.multiAreaEntries) ? json.multiAreaEntries : [];
  const byStart = new Map<number, number>();
  for (const e of entries) {
    const price = Number(e?.entryPerArea?.UK);
    const t0 = new Date(e?.deliveryStart).getTime();
    const t1 = new Date(e?.deliveryEnd).getTime();
    if (e?.entryPerArea?.UK == null || !Number.isFinite(price) || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) continue;
    for (let t = t0; t < t1; t += SLOT_MS) byStart.set(t, price);
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([t, pricePerMwh]) => ({ start: new Date(t).toISOString(), pricePerMwh }));
}

/** Static JSON published by the scheduled "Fetch Nord Pool" workflow (served from the Pages base path). */
export async function fetchNordPoolStatic(dateKey: string): Promise<WholesalePoint[]> {
  const json = await getJson(`${import.meta.env.BASE_URL}data/nordpool-gb-${dateKey}.json`);
  if (json?.date !== dateKey) throw new Error("snapshot is for a different date");
  return parseNordPoolPayload(json.payload);
}

/** Live Nord Pool request (may be blocked by CORS in the browser). */
export async function fetchNordPoolLive(dateKey: string): Promise<WholesalePoint[]> {
  let lastError: unknown = new Error("no market responded");
  for (const market of NORDPOOL_MARKETS) {
    try {
      const qs = new URLSearchParams({ date: dateKey, market, deliveryArea: "UK", currency: "GBP" });
      const points = parseNordPoolPayload(await getJson(`${NORDPOOL_DA}?${qs}`));
      if (points.length) return points;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError instanceof Error && lastError.message !== "no market responded") throw lastError;
  return [];
}

/** Nord Pool day-ahead: static snapshot first, then a live request. Never throws. */
export async function fetchNordPool(
  dateKey: string,
): Promise<{ points: WholesalePoint[]; attempts: SourceAttempt[]; source: string }> {
  const sources: [string, () => Promise<WholesalePoint[]>][] = [
    ["Nord Pool static snapshot", () => fetchNordPoolStatic(dateKey)],
    ["Nord Pool N2EX day-ahead", () => fetchNordPoolLive(dateKey)],
  ];
  const attempts: SourceAttempt[] = [];
  for (const [source, fn] of sources) {
    try {
      const points = await fn();
      attempts.push({ source, ok: true, points: points.length, detail: points.length ? "data returned" : "no prices published for this date yet" });
      if (points.length) return { points, attempts, source };
    } catch (e) {
      attempts.push({ source, ok: false, points: 0, detail: `request failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return { points: [], attempts, source: "" };
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

/** Elexon MID fallback; never throws. */
export async function fetchMidFallback(
  fromIso: string,
  toIso: string,
): Promise<{ points: WholesalePoint[]; attempts: SourceAttempt[] }> {
  const source = "Elexon market index (MID)";
  try {
    const points = await fetchElexonMid(fromIso, toIso);
    return { points, attempts: [{ source, ok: true, points: points.length, detail: points.length ? "data returned" : "responded but no prices for this date yet" }] };
  } catch (e) {
    return { points: [], attempts: [{ source, ok: false, points: 0, detail: `request failed: ${e instanceof Error ? e.message : String(e)}` }] };
  }
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
