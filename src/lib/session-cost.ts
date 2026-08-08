import { fromZonedTime } from "date-fns-tz";
import { fetchAgileRates } from "@/lib/octopus-api";
import { UK_TIMEZONE } from "@/lib/timezone";
import type { CachedSlotPrice, ChargeSession } from "@/lib/charge-data";

const DEFAULT_CHARGER_KW = 6.9;
const SLOT_HOURS = 0.5;

/** Build the list of half-hour slot start times that fall within [start, end). */
function enumerateHalfHourSlots(
  start: Date,
  end: Date,
): { from: Date; to: Date }[] {
  const slots: { from: Date; to: Date }[] = [];

  const cursor = new Date(start);
  cursor.setSeconds(0, 0);

  const minute = cursor.getMinutes();
  cursor.setMinutes(minute < 30 ? 0 : 30);

  while (cursor.getTime() < end.getTime()) {
    const next = new Date(cursor.getTime() + 30 * 60 * 1000);

    slots.push({
      from: new Date(cursor),
      to: next,
    });

    cursor.setTime(next.getTime());
  }

  return slots;
}

/**
 * Combine a YYYY-MM-DD date and HH:MM clock time,
 * interpreting the clock time in Europe/London.
 */
function combineDateTime(
  dateStr: string,
  timeStr: string,
): Date | null {
  if (!dateStr || !timeStr) return null;

  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  if (
    [year, month, day, hour, minute].some((n) => Number.isNaN(n))
  ) {
    return null;
  }

  const iso =
    `${year.toString().padStart(4, "0")}-` +
    `${month.toString().padStart(2, "0")}-` +
    `${day.toString().padStart(2, "0")}T` +
    `${hour.toString().padStart(2, "0")}:` +
    `${minute.toString().padStart(2, "0")}:00`;

  return fromZonedTime(iso, UK_TIMEZONE);
}

function positiveNumber(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

/**
 * Recalculate Agile slots and charging cost.
 *
 * IMPORTANT:
 * This function does NOT replace battery/measured energy with a time estimate.
 *
 * Cost energy priority:
 *   1. measured_grid_energy_kwh
 *   2. time-based estimated grid energy
 *
 * battery_energy_kwh is deliberately not treated as grid consumption.
 */
export async function recalcSessionCost(
  session: ChargeSession,
  edits: Partial<ChargeSession>,
): Promise<{
  total_cost_gbp: number;
  avg_pence_per_kwh: number;
  num_slots: number;
  slot_prices: CachedSlotPrice[];
  estimated_grid_energy_kwh: number;
} | null> {
  const merged = { ...session, ...edits };

  const startDate = combineDateTime(
    merged.session_date,
    merged.start_time || "",
  );

  const endDate = combineDateTime(
    merged.session_date,
    merged.end_time || "",
  );

  if (!startDate || !endDate) return null;

  // Overnight charging.
  if (endDate.getTime() <= startDate.getTime()) {
    endDate.setDate(endDate.getDate() + 1);
  }

  const wantedSlots = enumerateHalfHourSlots(startDate, endDate);

  if (wantedSlots.length === 0) return null;

  const slotHours = wantedSlots.map((slot) => {
    const overlapMs =
      Math.min(endDate.getTime(), slot.to.getTime()) -
      Math.max(startDate.getTime(), slot.from.getTime());

    return Math.max(0, overlapMs) / (1000 * 60 * 60);
  });

  const totalHours = slotHours.reduce(
    (total, hours) => total + hours,
    0,
  );

  if (totalHours <= 0) return null;

  const cache = new Map<string, CachedSlotPrice>();

  for (const price of session.slot_prices || []) {
    cache.set(
      new Date(price.valid_from).toISOString(),
      price,
    );
  }

  const missing = wantedSlots.filter(
    (slot) => !cache.has(slot.from.toISOString()),
  );

  if (missing.length > 0) {
    const periodFrom = new Date(
      missing[0].from.getTime() - 60 * 60 * 1000,
    ).toISOString();

    const periodTo = new Date(
      missing[missing.length - 1].to.getTime() +
        60 * 60 * 1000,
    ).toISOString();

    try {
      const rates = await fetchAgileRates(
        undefined,
        periodFrom,
        periodTo,
        session.region,
      );

      for (const rate of rates) {
        const key = new Date(
          rate.valid_from,
        ).toISOString();

        if (!cache.has(key)) {
          cache.set(key, {
            valid_from: rate.valid_from,
            valid_to: rate.valid_to,
            value_inc_vat: rate.value_inc_vat,
          });
        }
      }
    } catch (error) {
      console.warn(
        "Failed to fetch historical Agile prices for recalc",
        error,
      );
    }
  }

  const fallbackPrice =
    session.avg_pence_per_kwh || 0;

  const resolved: CachedSlotPrice[] =
    wantedSlots.map((slot) => {
      const found = cache.get(
        slot.from.toISOString(),
      );

      if (found) return found;

      return {
        valid_from: slot.from.toISOString(),
        valid_to: slot.to.toISOString(),
        value_inc_vat: fallbackPrice,
      };
    });

  const chargerKw =
    positiveNumber(merged.configured_charger_kw) ??
    DEFAULT_CHARGER_KW;

  const timeEstimatedGridEnergy =
    chargerKw * totalHours;

  const measuredGridEnergy =
    positiveNumber(
      merged.measured_grid_energy_kwh,
    );

  /*
   * Allocate the energy used for costing proportionally across the
   * session duration.
   *
   * If a real grid-meter measurement exists, that wins.
   * Otherwise use the explicit time-based grid estimate.
   */
  const costEnergy =
    measuredGridEnergy ??
    timeEstimatedGridEnergy;

  const slotEnergy = slotHours.map(
    (hours) =>
      costEnergy * (hours / totalHours),
  );

  const cost = resolved.reduce(
    (total, price, index) =>
      total +
      (
        price.value_inc_vat *
        slotEnergy[index]
      ) /
        100,
    0,
  );

  const avg =
    costEnergy > 0
      ? (cost * 100) / costEnergy
      : 0;

  const effectiveSlots = Number(
    (totalHours / SLOT_HOURS).toFixed(2),
  );

  return {
    total_cost_gbp: Number(cost.toFixed(2)),
    avg_pence_per_kwh: Number(avg.toFixed(2)),
    num_slots: effectiveSlots,
    slot_prices: resolved,
    estimated_grid_energy_kwh: Number(
      timeEstimatedGridEnergy.toFixed(2),
    ),
  };
}
