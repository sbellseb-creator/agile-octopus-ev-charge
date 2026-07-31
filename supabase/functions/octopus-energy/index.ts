import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  discoverElectricitySupplies,
  OctopusApiError,
  OctopusClient,
  REGION_NAMES,
  type RegionCode,
} from "../_shared/octopus/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(
  data: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== "POST") return {};

  const contentType = req.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) return {};

  try {
    return await req.json() as Record<string, unknown>;
  } catch {
    throw new Error("Request body must contain valid JSON");
  }
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function validateRegion(region: string): RegionCode {
  const normalised = region.trim().toUpperCase();

  if (!(normalised in REGION_NAMES)) {
    throw new Error(
      `Invalid region '${region}'. Valid regions: ${
        Object.keys(REGION_NAMES).join(", ")
      }`,
    );
  }

  return normalised as RegionCode;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const body = await readJsonBody(req);

    const action = (
      optionalString(body, "action") ??
        url.searchParams.get("action") ??
        "rates"
    ).toLowerCase();

    /*
     * Supports:
     * 1. A per-user API key supplied by the authenticated application.
     * 2. The legacy global OCTOPUS_API_KEY secret during migration.
     *
     * Do not put API keys in query strings.
     */
    const apiKey =
      optionalString(body, "apiKey") ??
        Deno.env.get("OCTOPUS_API_KEY") ??
        undefined;

    if (action === "regions") {
      return jsonResponse({
        regions: Object.entries(REGION_NAMES).map(([code, name]) => ({
          code,
          name,
        })),
      });
    }

    if (action === "verify-account" || action === "discover-account") {
      const accountNumber =
        optionalString(body, "accountNumber") ??
          url.searchParams.get("account_number") ??
          "";

      if (!apiKey) {
        return jsonResponse(
          { error: "Octopus API key is required" },
          400,
        );
      }

      if (!accountNumber.trim()) {
        return jsonResponse(
          { error: "Octopus account number is required" },
          400,
        );
      }

      const client = new OctopusClient(apiKey);
      const account = await client.getAccount(accountNumber);
      const supplies = discoverElectricitySupplies(account);

      return jsonResponse({
        success: true,
        accountNumber: account.number,
        supplies,
        selectedSupply: supplies[0] ?? null,
      });
    }

    if (action === "rates" || action === "tracker") {
      const defaultProduct =
        action === "tracker"
          ? "SILVER-24-10-01"
          : "AGILE-24-10-01";

      const productCode =
        optionalString(body, "tariffCode") ??
          optionalString(body, "productCode") ??
          url.searchParams.get("tariff_code") ??
          defaultProduct;

      const regionInput =
        optionalString(body, "region") ??
          url.searchParams.get("region") ??
          "F";

      const periodFrom =
        optionalString(body, "periodFrom") ??
          url.searchParams.get("period_from") ??
          undefined;

      const periodTo =
        optionalString(body, "periodTo") ??
          url.searchParams.get("period_to") ??
          undefined;

      const regionCode = validateRegion(regionInput);
      const client = new OctopusClient(apiKey);

      const rates = await client.getStandardUnitRates(
        productCode,
        regionCode,
        periodFrom,
        periodTo,
      );

      return jsonResponse({
        ...rates,
        meta: {
          productCode,
          regionCode,
          regionName: REGION_NAMES[regionCode],
        },
      });
    }

    return jsonResponse(
      {
        error: "Unknown action",
        supportedActions: [
          "regions",
          "verify-account",
          "discover-account",
          "rates",
          "tracker",
        ],
      },
      400,
    );
  } catch (error: unknown) {
    console.error("Octopus function error:", error);

    if (error instanceof OctopusApiError) {
      const status =
        error.status === 401 || error.status === 403
          ? 401
          : error.status === 404
          ? 404
          : 502;

      return jsonResponse(
        {
          error: error.message,
          upstreamStatus: error.status,
          upstreamBody: error.responseBody,
        },
        status,
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return jsonResponse({ error: message }, 500);
  }
});
