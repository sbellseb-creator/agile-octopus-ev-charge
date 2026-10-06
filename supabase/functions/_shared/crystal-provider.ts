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
 * Elexon BMRS Market Index Data (free, public API, no key). It is the
 * published GB wholesale reference price by settlement period (APX provider),
 * used here as a proxy for the day-ahead auction result. This is an
 * approximation: verify it tracks the auction closely before relying on it,
 * or swap in another provider implementing WholesaleProvider.
 */
export class ElexonMidProvider implements WholesaleProvider {
  readonly id = "elexon-mid";
  readonly label = "Elexon BMRS Market Index (APX)";
  readonly isMock = false;

  async fetchDay(ukDate: string): Promise<WholesaleSlot[]> {
    const from = ukMidnightUtc(ukDate);
    const to = ukMidnightUtc(addDays(ukDate, 1));
    const url = `https://data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index?from=${from.toISOString()}&to=${to.toISOString()}&format=json`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Elexon API error [${res.status}]`);
    const json = await res.json();
    const rows: Array<{ startTime: string; dataProvider: string; price: number; volume?: number }> = json?.data ?? [];
    const byStart = new Map<string, WholesaleSlot>();
    for (const r of rows) {
      if (r.dataProvider !== "APXMIDP" || typeof r.price !== "number") continue;
      const start = new Date(r.startTime);
      byStart.set(start.toISOString(), {
        valid_from: start.toISOString(),
        valid_to: new Date(start.getTime() + 30 * 60_000).toISOString(),
        pence_per_kwh: poundsPerMwhToPencePerKwh(r.price),
      });
    }
    return [...byStart.values()].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  }
}

/** PLACEHOLDER: deterministic fake prices for UI testing. Never real data. */
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
  return id === "mock" ? new MockProvider() : new ElexonMidProvider();
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
