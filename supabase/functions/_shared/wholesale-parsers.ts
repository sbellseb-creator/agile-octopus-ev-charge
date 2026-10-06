// Pure parsers for wholesale price feeds. No Deno/npm APIs.
import { addDays, poundsPerMwhToPencePerKwh, ukMidnightUtc } from "./agile-core.ts";

export interface WholesaleSlot {
  valid_from: string;
  valid_to: string;
  /** Wholesale price in p/kWh ex VAT. */
  pence_per_kwh: number;
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

/**
 * Elexon BMRS Market Index Data (/balancing/pricing/market-index): one row per
 * settlement period per data provider, price in GBP/MWh. Rows with no traded
 * volume are placeholders (price 0), so they are dropped rather than treated as
 * a real 0p price. This is SETTLEMENT data: it only exists once the period has
 * been (or is being) delivered, so it cannot supply next-day prices.
 */
export function parseElexonMarketIndex(json: unknown, dataProvider: string, ukDate: string): WholesaleSlot[] {
  const rows = (json as { data?: Array<{ startTime?: string; dataProvider?: string; price?: number; volume?: number }> })?.data ?? [];
  const dayStart = ukMidnightUtc(ukDate).getTime();
  const dayEnd = ukMidnightUtc(addDays(ukDate, 1)).getTime();
  const byStart = new Map<number, number>();
  for (const r of rows) {
    if (r.dataProvider && r.dataProvider !== dataProvider) continue;
    const t = Date.parse(r.startTime ?? "");
    if (!Number.isFinite(t) || typeof r.price !== "number" || !Number.isFinite(r.price)) continue;
    if (typeof r.volume === "number" && r.volume === 0) continue;
    if (t < dayStart || t >= dayEnd) continue;
    byStart.set(t, r.price);
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([t, price]) => ({
    valid_from: new Date(t).toISOString(),
    valid_to: new Date(t + SLOT_MS).toISOString(),
    pence_per_kwh: poundsPerMwhToPencePerKwh(price),
  }));
}
