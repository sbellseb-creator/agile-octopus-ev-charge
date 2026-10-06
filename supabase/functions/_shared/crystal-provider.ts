import {
  type AgileFormulaConfig, type PriceSlot, DEFAULT_AGILE_FORMULA, addDays,
  agilePriceFromWholesale, poundsPerMwhToPencePerKwh, ukMidnightUtc,
} from "./agile-core.ts";

export interface WholesaleSlot {
  valid_from: string;
  valid_to: string;
  /** Wholesale price in p/kWh ex VAT. */
  pence_per_kwh: number;
}

export interface WholesaleProvider {
  readonly id: string;
  readonly label: string;
  readonly isMock: boolean;
  /** Half-hourly wholesale prices for a UK delivery day, or [] if not yet available. */
  fetchDay(ukDate: string): Promise<WholesaleSlot[]>;
}

/**
 * Nord Pool Data Portal: day-ahead auction results (GB/UK delivery area, GBP/MWh).
 * Public API, no key. It returns HTTP 204 (no content) until the auction result
 * has been published (around 11:30-11:42 UK time, after the ~11:00 auction
 * close), in which case fetchDay returns [] and callers show a waiting state.
 * Override the endpoint/area with NORDPOOL_API_URL / NORDPOOL_DELIVERY_AREA.
 */
export class NordPoolDayAheadProvider implements WholesaleProvider {
  readonly id = "nordpool-day-ahead";
  readonly label = "Nord Pool GB day-ahead auction";
  readonly isMock = false;

  constructor(
    private readonly baseUrl = Deno.env.get("NORDPOOL_API_URL") ?? "https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices",
    private readonly area = Deno.env.get("NORDPOOL_DELIVERY_AREA") ?? "UK",
  ) {}

  async fetchDay(ukDate: string): Promise<WholesaleSlot[]> {
    const url = `${this.baseUrl}?${new URLSearchParams({ date: ukDate, market: "DayAhead", deliveryArea: this.area, currency: "GBP" })}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 204 || res.status === 404) return [];
    if (!res.ok) throw new Error(`Nord Pool API error [${res.status}]`);
    const json = await res.json();
    return parseNordPoolDayAhead(json, this.area, ukDate);
  }
}

const SLOT_MS = 30 * 60_000;

/** Convert a Nord Pool DayAheadPrices payload to half-hourly p/kWh slots within the UK delivery day. */
export function parseNordPoolDayAhead(json: unknown, area: string, ukDate: string): WholesaleSlot[] {
  const entries = (json as { multiAreaEntries?: Array<{ deliveryStart: string; deliveryEnd: string; entryPerArea?: Record<string, number> }> })?.multiAreaEntries ?? [];
  const dayStart = ukMidnightUtc(ukDate).getTime();
  const dayEnd = ukMidnightUtc(addDays(ukDate, 1)).getTime();
  const acc = new Map<number, { sum: number; n: number }>();
  for (const e of entries) {
    const price = e.entryPerArea?.[area];
    const start = Date.parse(e.deliveryStart);
    const end = Date.parse(e.deliveryEnd);
    if (typeof price !== "number" || !Number.isFinite(price) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    for (let t = Math.floor(start / SLOT_MS) * SLOT_MS; t < end; t += SLOT_MS) {
      if (t < dayStart || t >= dayEnd) continue;
      const cur = acc.get(t) ?? { sum: 0, n: 0 };
      cur.sum += price;
      cur.n += 1;
      acc.set(t, cur);
    }
  }
  return [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({
    valid_from: new Date(t).toISOString(),
    valid_to: new Date(t + SLOT_MS).toISOString(),
    pence_per_kwh: poundsPerMwhToPencePerKwh(v.sum / v.n),
  }));
}

/** PLACEHOLDER: deterministic fake prices for UI testing only; opt-in via CRYSTAL_PROVIDER=mock, never the default. */
export class MockProvider implements WholesaleProvider {
  readonly id = "mock";
  readonly label = "MOCK data (placeholder, not real prices)";
  readonly isMock = true;

  async fetchDay(ukDate: string): Promise<WholesaleSlot[]> {
    const start = ukMidnightUtc(ukDate).getTime();
    const out: WholesaleSlot[] = [];
    for (let i = 0; i < 48; i++) {
      const hour = i / 2;
      // Cheap overnight, dip at midday, evening bump.
      const wholesale = 6 + 4 * Math.sin(((hour - 6) / 24) * 2 * Math.PI) + (hour >= 16 && hour < 19 ? 8 : 0) - (hour >= 2 && hour < 4 ? 9 : 0);
      out.push({
        valid_from: new Date(start + i * 30 * 60_000).toISOString(),
        valid_to: new Date(start + (i + 1) * 30 * 60_000).toISOString(),
        pence_per_kwh: wholesale,
      });
    }
    return out;
  }
}

export function getProvider(id: string | undefined): WholesaleProvider {
  return id === "mock" ? new MockProvider() : new NordPoolDayAheadProvider();
}

export async function estimateAgileDay(
  provider: WholesaleProvider,
  ukDate: string,
  cfg: AgileFormulaConfig = DEFAULT_AGILE_FORMULA,
): Promise<PriceSlot[]> {
  const wholesale = await provider.fetchDay(ukDate);
  return wholesale.map((w) => ({
    valid_from: w.valid_from,
    valid_to: w.valid_to,
    value_inc_vat: agilePriceFromWholesale(w.pence_per_kwh, new Date(w.valid_from), cfg),
  }));
}
