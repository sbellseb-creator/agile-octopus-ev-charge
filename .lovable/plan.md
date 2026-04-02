

## Bug: Start SoC of 0% defaults to 20%

**Root Cause (line 102 of ChargePlanner.tsx):**
```js
const socDelta = (parseFloat(endSoc) || 80) - (parseFloat(startSoc) || 20);
```
`parseFloat("0")` returns `0`, which is falsy in JavaScript. The `|| 20` fallback triggers, so entering 0% start SoC actually calculates as 20% start SoC. This gives `(100 - 20) = 80%` of 75 kWh = **60 kWh** instead of the correct 75 kWh.

## Fix

**File: `src/components/ChargePlanner.tsx`, line 102**

Replace the falsy-fallback pattern with explicit `NaN` checks:

```ts
const start = parseFloat(startSoc);
const end = parseFloat(endSoc);
const socDelta = (isNaN(end) ? 80 : end) - (isNaN(start) ? 20 : start);
```

This ensures `0` is treated as a valid value. With this fix, 0→100% on a 75 kWh battery will correctly show **75 kWh** energy needed and **22 slots**.

Single file, ~3 lines changed.

