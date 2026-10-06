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

/** Wholesale (EPEX GB, APXMIDP) market index prices in £/MWh for [fromIso, toIso). */
export async function fetchWholesale(fromIso: string, toIso: string): Promise<WholesalePoint[]> {
  const qs = new URLSearchParams({ from: fromIso, to: toIso, format: "json" });
  const json = await getJson(`${ELEXON_MID}?${qs}`);
  const rows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const apx = rows.filter((r) => r?.dataProvider === "APXMIDP");
  return (apx.length > 0 ? apx : rows)
    .filter((r) => r && typeof r.startTime === "string" && typeof r.price === "number")
    .map((r) => ({ start: new Date(r.startTime).toISOString(), pricePerMwh: r.price as number }));
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
