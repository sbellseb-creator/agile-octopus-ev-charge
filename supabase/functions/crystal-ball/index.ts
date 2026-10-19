import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { addDays, ukDate } from "../_shared/agile-core.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown> = {};

    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const url = new URL(req.url);

    const region =
      ((body.region as string) ||
        url.searchParams.get("region") ||
        "P").toUpperCase();

    const targetUrl =
      `https://agile-rates.uk/api/v2/current/${region}`;

    const response = await fetch(targetUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Agile API returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    console.log(
      "Agile API:",
      JSON.stringify(data, null, 2)
    );

    const tomorrow =
      data.import_predictions_tomorrow ||
      data.import_predictions ||
      [];

    const rates = tomorrow
      .map((slot: any) => ({
        valid_from: slot.start,
        valid_to: slot.end,
        value_inc_vat: Number(
          slot.rates?.[region] ?? 0
        ),
        value_exc_vat: Number(
          (
            Number(slot.rates?.[region] ?? 0) / 1.05
          ).toFixed(2)
        ),
        is_predicted: true,
      }))
      .filter(
        (r: any) =>
          r.valid_from &&
          !Number.isNaN(r.value_inc_vat)
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.valid_from).getTime() -
          new Date(b.valid_from).getTime()
      );

    const tomorrowDate = addDays(
      ukDate(new Date()),
      1
    );

    return json({
      date: tomorrowDate,
      status: rates.length ? "available" : "waiting",
      available: rates.length > 0,
      region,
      estimated: true,
      source: "agile-rates.uk",
      is_mock: false,
      updated_at: new Date().toISOString(),
      rates,
      results: rates,
    });
  } catch (error: any) {
    console.error(error);

    return json({
      status: "error",
      available: false,
      error: error.message ?? "Unknown error",
      rates: [],
      results: [],
    });
  }
});
