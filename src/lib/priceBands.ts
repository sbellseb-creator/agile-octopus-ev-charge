/** Single source of truth for Crystal Ball price colours (p/kWh inc VAT); used by chart bars, list and key. */
export const BAND_GREEN_BELOW = 15;
export const BAND_AMBER_BELOW = 25;
export const BAND_ORANGE_UPTO = 30; // above this is red

export interface PriceBand {
  id: "negative" | "green" | "amber" | "orange" | "red";
  label: string;
  range: string;
  colour: string;
}

export const PRICE_BANDS: Record<PriceBand["id"], PriceBand> = {
  negative: { id: "negative", label: "Negative", range: "below 0p", colour: "#22d3ee" },
  green: { id: "green", label: "Green", range: `under ${BAND_GREEN_BELOW}p`, colour: "#4ade80" },
  amber: { id: "amber", label: "Amber", range: `${BAND_GREEN_BELOW}–${BAND_AMBER_BELOW}p`, colour: "#facc15" },
  orange: { id: "orange", label: "Orange", range: `${BAND_AMBER_BELOW}–${BAND_ORANGE_UPTO}p`, colour: "#fb923c" },
  red: { id: "red", label: "Red", range: `over ${BAND_ORANGE_UPTO}p`, colour: "#f87171" },
};

export const PRICE_BAND_ORDER: PriceBand[] = [
  PRICE_BANDS.negative, PRICE_BANDS.green, PRICE_BANDS.amber, PRICE_BANDS.orange, PRICE_BANDS.red,
];

/** Band for a price in p/kWh. Boundaries: <0 negative, <15 green, <25 amber, <=30 orange, >30 red. */
export function priceBand(price: number): PriceBand {
  if (price < 0) return PRICE_BANDS.negative;
  if (price < BAND_GREEN_BELOW) return PRICE_BANDS.green;
  if (price < BAND_AMBER_BELOW) return PRICE_BANDS.amber;
  if (price <= BAND_ORANGE_UPTO) return PRICE_BANDS.orange;
  return PRICE_BANDS.red;
}
