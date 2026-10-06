import {
  type AgileFormulaConfig, type PriceSlot, DEFAULT_AGILE_FORMULA, addDays,
  agilePriceFromWholesale, parseFormulaOverrides, ukDate, ukMidnightUtc,
} from "./agile-core.ts";
import { ProviderError } from "./crystal-status.ts";
import { type WholesaleSlot, parseElexonMarketIndex, parseNordPoolDayAhead } from "./wholesale-parsers.ts";

export type { WholesaleSlot };
export { parseElexonMarketIndex, parseNordPoolDayAhead };

export interface WholesaleProvider {
  readonly id: string;
  readonly label: string;
  readonly isMock: boolean;
  /** Half-hourly wholesale prices for a UK delivery day, or [] if not yet available. Throws ProviderError on failure. */
  fetchDay(ukDate: string): Promise<WholesaleSlot[]>;
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<{ status: number; json?: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  } catch (e) {
    throw new ProviderError("network_error", `Network error: ${e instanceof Error ? e.message : e}`);
  }
  if (res.status === 204 || res.status === 404) return { status: res.status };
  if (res.status === 401 || res.status === 403) {
    throw new ProviderError("auth_required", `The data source rejected the request [${res.status}]: an API token/subscription is required`);
  }
  if (!res.ok) throw new ProviderError("upstream_error", `Upstream API error [${res.status}]`);
  try {
    return { status: res.status, json: await res.json() };
  } catch {
    throw new ProviderError("bad_response", "Upstream API returned invalid JSON");
  }
}

/**
 * Nord Pool Data Portal day-ahead auction results (N2EX GB hourly auction,
 * GBP/MWh). This is the genuine next-day source, published ~11:30-11:42 UK
 * after the ~11:00 auction close. Nord Pool's API is NOT free/keyless: it needs
 * a subscription, supplied as the NORDPOOL_API_TOKEN bearer-token secret.
 * Returns [] while unpublished (HTTP 204/404). Override endpoint/area with
 * NORDPOOL_API_URL / NORDPOOL_DELIVERY_AREA.
 */
export class NordPoolDayAheadProvider implements WholesaleProvider {
  readonly id = "nordpool-day-ahead";
  readonly label = "Nord Pool GB day-ahead auction";
  readonly isMock = false;

  constructor(
    private readonly token = Deno.env.get("NORDPOOL_API_TOKEN"),
    private readonly baseUrl = Deno.env.get("NORDPOOL_API_URL") ?? "https://dataportal-api.nordpoolgroup.com/api/DayAheadPrices",
    private readonly area = Deno.env.get("NORDPOOL_DELIVERY_AREA") ?? "UK",
  ) {}

  async fetchDay(ukDate: string): Promise<WholesaleSlot[]> {
    const url = `${this.baseUrl}?${new URLSearchParams({ date: ukDate, market: "DayAhead", deliveryArea: this.area, currency: "GBP" })}`;
    const { json } = await fetchJson(url, this.token ? { Authorization: "Bearer " + this.token } : {});
    return json === undefined ? [] : parseNordPoolDayAhead(json, this.area, ukDate);
  }
}

/**
 * Elexon BMRS Market Index (keyless, public). SETTLEMENT data, published as
 * each period is delivered, so it works for yesterday/the last 7 days (and the
 * elapsed part of today) but NEVER for tomorrow. Used for previous-day
 * diagnostics and calibration. Filter with ELEXON_MID_PROVIDER (default APXMIDP).
 */
export class ElexonMarketIndexProvider implements WholesaleProvider {
  readonly id = "elexon-mid";
  readonly label = "Elexon Market Index (settled, not day-ahead)";
  readonly isMock = false;

  constructor(
    private readonly dataProvider = Deno.env.get("ELEXON_MID_PROVIDER") ?? "APXMIDP",
    private readonly baseUrl = Deno.env.get("ELEXON_API_URL") ?? "https://data.elexon.co.uk/bmrs/api/v1/balancing/pricing/market-index",
  ) {}

  async fetchDay(ukDate: string): Promise<WholesaleSlot[]> {
    const from = ukMidnightUtc(ukDate).toISOString();
    const to = ukMidnightUtc(addDays(ukDate, 1)).toISOString();
    const url = `${this.baseUrl}?${new URLSearchParams({ from, to, format: "json", dataProviders: this.dataProvider })}`;
    const { json } = await fetchJson(url, {});
    return json === undefined ? [] : parseElexonMarketIndex(json, this.dataProvider, ukDate);
  }
}

/** Used for future days when no keyed day-ahead source is configured: fails honestly, never guesses. */
export class UnconfiguredDayAheadProvider implements WholesaleProvider {
  readonly id = "none";
  readonly label = "No day-ahead source configured";
  readonly isMock = false;

  fetchDay(): Promise<WholesaleSlot[]> {
    return Promise.reject(new ProviderError(
      "not_configured",
      "No free source publishes GB next-day auction prices. Set the NORDPOOL_API_TOKEN function secret (Nord Pool Data Portal subscription).",
    ));
  }
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

/**
 * Pick the provider for a delivery day. CRYSTAL_PROVIDER forces one of
 * mock | nordpool | elexon. Otherwise: Nord Pool whenever a token is set;
 * without one, settled days (today and earlier) use Elexon and future days
 * report "not configured" rather than inventing numbers.
 */
export function getProvider(id: string | undefined, date: string = addDays(ukDate(new Date()), 1), today: string = ukDate(new Date())): WholesaleProvider {
  if (id === "mock") return new MockProvider();
  if (id === "nordpool") return new NordPoolDayAheadProvider();
  if (id === "elexon") return new ElexonMarketIndexProvider();
  if (Deno.env.get("NORDPOOL_API_TOKEN")) return new NordPoolDayAheadProvider();
  return date <= today ? new ElexonMarketIndexProvider() : new UnconfiguredDayAheadProvider();
}

export function formulaFromEnv(): AgileFormulaConfig {
  return parseFormulaOverrides({
    AGILE_MULTIPLIER: Deno.env.get("AGILE_MULTIPLIER"),
    AGILE_PEAK_ADDER: Deno.env.get("AGILE_PEAK_ADDER"),
    AGILE_PEAK_START_HOUR: Deno.env.get("AGILE_PEAK_START_HOUR"),
    AGILE_PEAK_END_HOUR: Deno.env.get("AGILE_PEAK_END_HOUR"),
    AGILE_VAT_FACTOR: Deno.env.get("AGILE_VAT_FACTOR"),
    AGILE_CAP: Deno.env.get("AGILE_CAP"),
    AGILE_FLOOR: Deno.env.get("AGILE_FLOOR"),
  });
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
