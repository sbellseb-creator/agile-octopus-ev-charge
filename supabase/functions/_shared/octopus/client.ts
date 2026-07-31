import type {
  OctopusAccount,
  OctopusRate,
  PaginatedResponse,
  RegionCode,
} from "./types.ts";
import { buildElectricityTariffCode } from "./tariffs.ts";

const OCTOPUS_BASE_URL = "https://api.octopus.energy/v1";

export class OctopusApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "OctopusApiError";
  }
}

export class OctopusClient {
  constructor(private readonly apiKey?: string) {}

  private async request<T>(
    pathOrUrl: string,
    options: { authenticated?: boolean } = {},
  ): Promise<T> {
    const authenticated = options.authenticated ?? false;

    if (authenticated && !this.apiKey) {
      throw new Error("An Octopus API key is required for this request");
    }

    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${OCTOPUS_BASE_URL}${pathOrUrl}`;

    const headers = new Headers({
      Accept: "application/json",
    });

    if (authenticated && this.apiKey) {
      headers.set(
        "Authorization",
        `Basic ${btoa(`${this.apiKey}:`)}`,
      );
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const responseBody = await response.text();

      throw new OctopusApiError(
        `Octopus API returned ${response.status} ${response.statusText}`,
        response.status,
        responseBody,
      );
    }

    return await response.json() as T;
  }

  getAccount(accountNumber: string): Promise<OctopusAccount> {
    const normalised = accountNumber.trim().toUpperCase();

    if (!normalised) {
      throw new Error("Octopus account number is required");
    }

    return this.request<OctopusAccount>(
      `/accounts/${encodeURIComponent(normalised)}/`,
      { authenticated: true },
    );
  }

  getStandardUnitRates(
    productCode: string,
    regionCode: RegionCode,
    periodFrom?: string,
    periodTo?: string,
  ): Promise<PaginatedResponse<OctopusRate>> {
    const tariffCode = buildElectricityTariffCode(
      productCode,
      regionCode,
    );

    const params = new URLSearchParams({
      page_size: "250",
      order_by: "period",
    });

    if (periodFrom) params.set("period_from", periodFrom);
    if (periodTo) params.set("period_to", periodTo);

    return this.request<PaginatedResponse<OctopusRate>>(
      `/products/${encodeURIComponent(productCode)}` +
        `/electricity-tariffs/${encodeURIComponent(tariffCode)}` +
        `/standard-unit-rates/?${params.toString()}`,
    );
  }
}
