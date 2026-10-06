import {
  addDays, averagePrice, cheapestWindow, negativeSlots, ukDate, type PriceSlot,
} from "../../supabase/functions/_shared/agile-core";

export * from "../../supabase/functions/_shared/agile-core";
export * from "../../supabase/functions/_shared/crystal-status";

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
