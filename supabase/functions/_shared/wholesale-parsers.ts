// Pure parsers for wholesale price feeds. No Deno/npm APIs.
import { addDays, poundsPerMwhToPencePerKwh, ukMidnightUtc } from "./agile-core.ts";
import { ukTimeToUtc } from "./crystal-status.ts";

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

const HOUR_MS = 60 * 60_000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const pick = (fields: string[], candidates: string[]): string | undefined => {
  const byNorm = new Map(fields.map((f) => [norm(f), f]));
  for (const c of candidates) { const hit = byNorm.get(norm(c)); if (hit) return hit; }
  return undefined;
};
const TIME_FIELDS = ["datetime_gmt", "datetime_utc", "datetime", "delivery_start", "start_time", "starttime", "datetime_local", "datetime_bst"];
const DATE_FIELDS = ["settlement_date", "delivery_date", "date_gmt", "date"];
const PERIOD_FIELDS = ["settlement_period", "period", "sp"];
const PRICE_FIELDS = ["price", "n2ex_price", "day_ahead_price", "dayahead_price", "price_gbp_mwh", "gb_price", "value"];

/** Parse a CKAN timestamp. Zone-less values are only accepted when the field name says GMT/UTC (UTC) or local/BST (Europe/London). */
function parseNesoInstant(raw: unknown, field: string): number {
  if (typeof raw !== "string") return NaN;
  const s = raw.trim().replace(" ", "T");
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return Date.parse(s);
  const f = field.toLowerCase();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return NaN;
  if (/gmt|utc/.test(f)) return Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`);
  if (/local|bst/.test(f)) return ukTimeToUtc(m[1], Number(m[2]), Number(m[3])).getTime();
  return NaN;
}

/**
 * NESO Data Portal (CKAN datastore_search) "N2EX GB Day-Ahead Price" records -> half-hourly
 * p/kWh slots within the UK delivery day. Prices are GBP/MWh. Hourly prices are applied to
 * both half-hours of that hour. Records either carry a timestamp column, or a date plus a
 * settlement period (elapsed-time periods from UK local midnight, so DST days work).
 * `fields` is the CKAN field list (ids); unrecognised schemas throw rather than guess.
 */
export function parseNesoN2ex(
  records: Array<Record<string, unknown>>,
  fields: string[],
  ukDate: string,
): WholesaleSlot[] {
  const priceField = pick(fields, PRICE_FIELDS);
  const timeField = pick(fields, TIME_FIELDS);
  const dateField = pick(fields, DATE_FIELDS);
  const periodField = pick(fields, PERIOD_FIELDS);
  if (!priceField || (!timeField && !(dateField && periodField))) {
    throw new Error(`Unrecognised NESO N2EX fields: ${fields.join(", ")}`);
  }
  const dayStart = ukMidnightUtc(ukDate).getTime();
  const dayEnd = ukMidnightUtc(addDays(ukDate, 1)).getTime();
  const points: Array<{ t: number; price: number }> = [];
  let unit = HOUR_MS;
  if (timeField) {
    for (const r of records) {
      const price = typeof r[priceField] === "string" && r[priceField] !== "" ? Number(r[priceField]) : r[priceField];
      const t = parseNesoInstant(r[timeField], timeField);
      if (typeof price === "number" && Number.isFinite(price) && Number.isFinite(t)) points.push({ t, price });
    }
  } else {
    const rows: Array<{ period: number; price: number }> = [];
    for (const r of records) {
      if (String(r[dateField!]).slice(0, 10) !== ukDate) continue;
      const price = Number(r[priceField]);
      const period = Number(r[periodField!]);
      if (r[priceField] === null || r[priceField] === "" || !Number.isFinite(price) || !Number.isInteger(period) || period < 1) continue;
      rows.push({ period, price });
    }
    // Hourly datasets number periods 1..23-25; half-hourly settlement periods go up to 46-50.
    unit = rows.some((r) => r.period > 25) ? SLOT_MS : HOUR_MS;
    for (const r of rows) points.push({ t: dayStart + (r.period - 1) * unit, price: r.price });
  }
  points.sort((a, b) => a.t - b.t);
  const starts = [...new Set(points.map((p) => p.t))];
  if (timeField) for (let i = 1; i < starts.length; i++) unit = Math.min(unit, starts[i] - starts[i - 1]);
  unit = Math.max(SLOT_MS, unit);
  const out = new Map<number, number>();
  for (const p of points) {
    for (let t = p.t; t < p.t + unit; t += SLOT_MS) {
      if (t >= dayStart && t < dayEnd) out.set(t, p.price);
    }
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([t, price]) => ({
    valid_from: new Date(t).toISOString(),
    valid_to: new Date(t + SLOT_MS).toISOString(),
    pence_per_kwh: poundsPerMwhToPencePerKwh(price),
  }));
}
