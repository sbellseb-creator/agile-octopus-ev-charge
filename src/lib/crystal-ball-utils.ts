import {
  addDays, averagePrice, cheapestWindow, negativeSlots, ukDate, type PriceSlot,
} from "../../supabase/functions/_shared/agile-core";

export * from "../../supabase/functions/_shared/agile-core";

export interface SlotComparison {
  valid_from: string;
  estimate: number | null;
  official: number;
  /** official - estimate (p/kWh). */
  diff: number | null;
}

export function compareEstimateToOfficial(estimate: PriceSlot[], official: PriceSlot[]) {
  const est = new Map(estimate.map((s) => [s.valid_from, s.value_inc_vat]));
  const slots: SlotComparison[] = official.map((o) => {
    const e = est.get(o.valid_from);
    return { valid_from: o.valid_from, estimate: e ?? null, official: o.value_inc_vat, diff: e === undefined ? null : o.value_inc_vat - e };
  });
  const diffs = slots.map((s) => s.diff).filter((d): d is number => d !== null);
  const averageDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
  const meanAbsDiff = diffs.length ? diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length : null;
  return { slots, averageDiff, meanAbsDiff };
}

export function summarise(slots: PriceSlot[], windowHours = 3) {
  const cheapest = slots.length ? slots.reduce((m, s) => (s.value_inc_vat < m.value_inc_vat ? s : m)) : null;
  return {
    cheapest,
    window: cheapestWindow(slots, windowHours),
    negatives: negativeSlots(slots),
    average: averagePrice(slots),
  };
}

export function tomorrowUk(now = new Date()): string {
  return addDays(ukDate(now), 1);
}
