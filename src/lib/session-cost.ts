import { fetchAgileRates } from "@/lib/octopus-api";
import type { CachedSlotPrice, ChargeSession } from "@/lib/charge-data";

const CHARGER_KW = 6.9;
const SLOT_HOURS = 0.5;
const KWH_PER_SLOT = CHARGER_KW * SLOT_HOURS;

/** Build the list of half-hour slot start times that fall within [start, end). */
function enumerateHalfHourSlots(start: Date, end: Date): { from: Date; to: Date }[] {
  const slots: { from: Date; to: Date }[] = [];
  // Snap start down to the previous half-hour boundary
  const cursor = new Date(start);
  cursor.setSeconds(0, 0);
  const m = cursor.getMinutes();
  cursor.setMinutes(m < 30 ? 0 : 30);
  while (cursor.getTime() < end.getTime()) {
    const next = new Date(cursor.getTime() + 30 * 60 * 1000);
    slots.push({ from: new Date(cursor), to: next });
    cursor.setTime(next.getTime());
  }
  return slots;
}

/** Combine a YYYY-MM-DD date string and HH:MM time string into a local Date. */
function combineDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

/**
 * Recalculate session energy / cost / avg price using actual half-hour Agile prices.
 * Uses cached `slot_prices` where possible and fetches from Octopus for any slots
 * not yet cached (e.g. when the user extends a session window after the fact).
 *
 * Returns updated values + the merged slot price cache.
 */
export async function recalcSessionCost(
  session: ChargeSession,
  edits: Partial<ChargeSession>
): Promise<{
  energy_added_kwh: number;
  total_cost_gbp: number;
  avg_pence_per_kwh: number;
  num_slots: number;
  slot_prices: CachedSlotPrice[];
} | null> {
  const merged = { ...session, ...edits };
  const startDate = combineDateTime(merged.session_date, merged.start_time || "");
  const endDate = combineDateTime(merged.session_date, merged.end_time || "");
  if (!startDate || !endDate) return null;
  // Handle overnight sessions (end < start)
  if (endDate.getTime() <= startDate.getTime()) {
    endDate.setDate(endDate.getDate() + 1);
  }

  const wantedSlots = enumerateHalfHourSlots(startDate, endDate);
  if (wantedSlots.length === 0) return null;

  // Fractional overlap (in hours) of each half-hour slot with the actual session window
  const slotHours: number[] = wantedSlots.map((s) => {
    const overlapMs = Math.min(endDate.getTime(), s.to.getTime()) - Math.max(startDate.getTime(), s.from.getTime());
    return Math.max(0, overlapMs) / (1000 * 60 * 60);
  });

  // Index existing cache by ISO valid_from for fast lookup
  const cache = new Map<string, CachedSlotPrice>();
  for (const sp of session.slot_prices || []) {
    cache.set(new Date(sp.valid_from).toISOString(), sp);
  }

  // Find any wanted slots not in cache
  const missing = wantedSlots.filter((s) => !cache.has(s.from.toISOString()));

  if (missing.length > 0) {
    // Fetch covering window from Octopus (with small padding)
    const periodFrom = new Date(missing[0].from.getTime() - 60 * 60 * 1000).toISOString();
    const periodTo = new Date(missing[missing.length - 1].to.getTime() + 60 * 60 * 1000).toISOString();
    try {
      const rates = await fetchAgileRates(undefined, periodFrom, periodTo, session.region);
      for (const r of rates) {
        const key = new Date(r.valid_from).toISOString();
        if (!cache.has(key)) {
          cache.set(key, {
            valid_from: r.valid_from,
            valid_to: r.valid_to,
            value_inc_vat: r.value_inc_vat,
          });
        }
      }
    } catch (e) {
      console.warn("Failed to fetch historical agile prices for recalc", e);
    }
  }

  // Resolve each wanted slot to a price; fall back to existing avg if API can't supply
  const fallbackPrice = session.avg_pence_per_kwh || 0;
  const resolved: CachedSlotPrice[] = wantedSlots.map((s) => {
    const found = cache.get(s.from.toISOString());
    if (found) return found;
    return {
      valid_from: s.from.toISOString(),
      valid_to: s.to.toISOString(),
      value_inc_vat: fallbackPrice,
    };
  });

  const energy = KWH_PER_SLOT * resolved.length;
  const cost = resolved.reduce((acc, sp) => acc + (sp.value_inc_vat * KWH_PER_SLOT) / 100, 0);
  const avg = resolved.reduce((acc, sp) => acc + sp.value_inc_vat, 0) / resolved.length;

  return {
    energy_added_kwh: parseFloat(energy.toFixed(2)),
    total_cost_gbp: parseFloat(cost.toFixed(2)),
    avg_pence_per_kwh: parseFloat(avg.toFixed(2)),
    num_slots: resolved.length,
    slot_prices: resolved,
  };
}
