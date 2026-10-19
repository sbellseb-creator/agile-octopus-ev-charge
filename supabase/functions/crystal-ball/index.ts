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

function calculateChargePlan(
  rates: any[],
  startSoc: number,
  targetSoc: number,
  batteryKwh = 75,
  chargerKw = 6.9
) {
  const energyRequired =
    batteryKwh * ((targetSoc - startSoc) / 100);

  const hoursRequired =
    energyRequired / chargerKw;

  const slotsRequired =
    Math.ceil(hoursRequired * 2);

  let bestCost = Number.MAX_VALUE;
  let bestWindow: any[] = [];

  for (let i = 0; i <= rates.length - slotsRequired; i++) {
    const window = rates.slice(i, i + slotsRequired);

    const avg =
      window.reduce(
        (sum, slot) => sum + slot.value_inc_vat,
        0
      ) / window.length;

    const cost =
      energyRequired * (avg / 100);

    if (cost < bestCost) {
      bestCost = cost;
      bestWindow = window;
    }
  }

  return {
    battery_kwh: batteryKwh,
    start_soc: startSoc,
    target_soc: targetSoc,
    energy_required_kwh: Number(
      energyRequired.toFixed(1)
    ),
    charger_kw: chargerKw,
    charge_hours: Number(
      hoursRequired.toFixed(2)
    ),
    estimated_cost: Number(
      bestCost.toFixed(2)
    ),
    recommended_start:
      bestWindow[0]?.valid_from ?? null,
    recommended_end:
      bestWindow[bestWindow.length - 1]?.valid_to ??
      null,
  };
}

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
        "F").toUpperCase();

    const startSoc = Number(
      body.startSoc ??
        url.searchParams.get("startSoc") ??
        40
    );

    const targetSoc = Number(
      body.targetSoc ??
        url.searchParams.get("targetSoc") ??
        80
    );

    const homeCharging =
      String(
        body.homeCharging ??
          url.searchParams.get("homeCharging") ??
          "true"
      ) === "true";

    const chargerKw = homeCharging ? 6.9 : 7.0;

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

    const chargePlan = calculateChargePlan(
      rates,
      startSoc,
      targetSoc,
      75,
      chargerKw
    );

    const minRate = Math.min(
      ...rates.map((r) => r.value_inc_vat)
    );

    const maxRate = Math.max(
      ...rates.map((r) => r.value_inc_vat)
    );

    const avgRate =
      rates.reduce(
        (sum, r) => sum + r.value_inc_vat,
        0
      ) / rates.length;

    const priceCap = 26.11;

    const vsPriceCap =
      ((avgRate - priceCap) / priceCap) * 100;

    return json({
      date: tomorrowDate,
      status: rates.length
        ? "available"
        : "waiting",
      available: rates.length > 0,
      region,

      summary: {
        min_rate: Number(
          minRate.toFixed(2)
        ),
        max_rate: Number(
          maxRate.toFixed(2)
        ),
        avg_rate: Number(
          avgRate.toFixed(2)
        ),
        price_cap: priceCap,
        vs_price_cap: Number(
          vsPriceCap.toFixed(0)
        ),
      },

      charging: chargePlan,

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
