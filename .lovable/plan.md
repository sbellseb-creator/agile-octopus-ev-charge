## Problem

In the **Log Charge Session** form, the "Avg p/kWh" estimate is hardcoded to **12p** (`DEFAULT_AVG_PRICE = 12` in `src/components/ChargeForm.tsx`). It never averages the real half-hour Octopus Agile prices for the chosen time window, so the estimated cost and avg price shown when logging are wrong (and the saved session inherits that wrong avg until edited).

The edit flow in `ChargeTable.tsx` already does this correctly via `recalcSessionCost()` from `src/lib/session-cost.ts` — pulling actual half-hour Agile prices and averaging them. The Log form should use the same logic.

## Fix

Reuse the existing `recalcSessionCost` helper inside `ChargeForm.tsx` so the live estimate (and the saved values) reflect real Agile prices for the chosen date + start/end time.

### Changes to `src/components/ChargeForm.tsx`

1. Remove the `DEFAULT_AVG_PRICE = 12` constant.
2. Replace the synchronous `useMemo` estimates with an async effect that:
   - Triggers when `date`, `startTime`, `endTime`, `selectedVehicle`, `startSoc`, `endSoc` change.
   - If `startTime` and `endTime` are both present, calls `recalcSessionCost()` with a synthetic session (date, times, region from `localStorage` `agile-region` or default `F`, no cached slot prices) to fetch real Agile half-hour prices and compute:
     - `avg_pence_per_kwh` = mean of the slot prices in window
     - `num_slots` = number of half-hour slots in window
     - `energy_added_kwh` = preferred from SoC delta (`battery_kwh * (endSoc-startSoc)/100`) when SoC is provided; otherwise from slots × 3.45 kWh
     - `total_cost_gbp` = `energy_added_kwh * avg / 100`
     - Cache `slot_prices` and `region` on the new session so future edits stay accurate.
   - If start/end times are missing, fall back to: SoC-based kWh + slots only, with avg/cost left as `0` and a small note "Add start & end time for accurate Agile pricing".
3. Show a loading state ("Fetching Agile prices…") in the estimates panel while the fetch is in-flight.
4. On submit, pass through the real `avg_pence_per_kwh`, `total_cost_gbp`, `num_slots`, `slot_prices`, and `region` so the saved session matches what the user saw.

### Notes

- Region defaults to `F` (North East) per project memory; read `localStorage.getItem("agile-region")` if present so it matches the Agile tab.
- Debounce the fetch by ~400ms to avoid spamming the Octopus edge function while the user is typing times/SoC.
- No backend changes. No new dependencies.
- No changes needed to `ChargeTable.tsx`, `session-cost.ts`, or `octopus-api.ts`.

### File touched

- `src/components/ChargeForm.tsx`
