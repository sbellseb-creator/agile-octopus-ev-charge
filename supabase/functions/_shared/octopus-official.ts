import type { PriceSlot } from "./agile-core.ts";

/** Official Agile rates are public; no API key needed. Region F by default. */
export async function fetchOfficialRates(
  periodFromIso: string,
  periodToIso: string,
  region: string,
  product = Deno.env.get("AGILE_PRODUCT_CODE") || "AGILE-24-10-01",
): Promise<PriceSlot[]> {
  const url = `https://api.octopus.energy/v1/products/${product}/electricity-tariffs/E-1R-${product}-${region}/standard-unit-rates/?period_from=${periodFromIso}&period_to=${periodToIso}&page_size=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Octopus rates API error [${res.status}]`);
  const json = await res.json();
  return ((json?.results ?? []) as PriceSlot[])
    .map((r) => ({ valid_from: r.valid_from, valid_to: r.valid_to, value_inc_vat: r.value_inc_vat }))
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
}
