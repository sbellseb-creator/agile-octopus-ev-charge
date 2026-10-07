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

/** Shape of the `wholesale` array returned by the crystal-ball Edge Function (p/kWh ex VAT). */
export interface EdgeWholesaleSlot {
  valid_from: string;
  pence_per_kwh: number;
}

/** Convert the Edge Function's half-hour wholesale slots (p/kWh) back to £/MWh points. */
export function parseEdgeWholesale(body: any): WholesalePoint[] {
  const rows: any[] = Array.isArray(body?.wholesale) ? body.wholesale : [];
  return rows
    .filter((r) => typeof r?.valid_from === "string" && typeof r?.pence_per_kwh === "number" && Number.isFinite(r.pence_per_kwh))
    .map((r) => ({ start: new Date(r.valid_from).toISOString(), pricePerMwh: r.pence_per_kwh * 10 }));
}

/**
 * GB N2EX day-ahead prices (NESO Data Portal), fetched server-side by the `crystal-ball` Edge Function
 * (no browser CORS, no token). Never throws; failures are reported as attempts.
 */
export async function fetchDayAhead(
  dateKey: string,
): Promise<{ points: WholesalePoint[]; attempts: SourceAttempt[]; source: string }> {
  const source = "N2EX day-ahead (NESO, server-side)";
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke("crystal-ball", { body: { date: dateKey, provider: "neso" } });
    if (error) throw error;
    if (data?.status === "error") throw new Error(data.error ?? "provider error");
    const points = parseEdgeWholesale(data);
    const detail = points.length ? "data returned" : "no prices published for this date yet";
    return { points, attempts: [{ source, ok: true, points: points.length, detail }], source: points.length ? source : "" };
  } catch (e) {
    return { points: [], attempts: [{ source, ok: false, points: 0, detail: `request failed: ${e instanceof Error ? e.message : String(e)}` }], source: "" };
  }
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
