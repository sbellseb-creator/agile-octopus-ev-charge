PATCH 031 — CONSOLIDATED CORRECTIVE RELEASE

This release replaces the incomplete Patch 030 overlay.

Included:
- Restores Agile as a primary navigation tab.
- Replaces the ambiguous "Cheapest route" wording with the best complete
  continuous charging block and separately identifies the lowest slot.
- Quarantines implausibly long low-energy automatic charging sessions.
- Adds review, amend, accept and delete controls for automatic sessions.
- Aligns the cockpit HMI to the Tesla screen.
- Replaces the screen badge with a rear-view-mirror air freshener.
- Installs the complete driveway photo catalogue in the patch itself:
  clear/partly cloudy, overcast, rain, sunset and night.
- Uses a genuine night photograph with the exterior wall light switched on.
- Selects night from live sunrise/sunset data, with a UK-time fallback.
- Makes every Home Appearance choice resolve to an installed photograph.
- Forces a fresh cache/service-worker migration on previously cached Fold and
  desktop installations.
- Adds a small "Release 031" header marker on screens at least 430 px wide so
  the deployed build can be positively identified.
- Protects the charger and illuminated wall light on Fold small: the charge
  status moves to the right and the weather badge moves to the lower right;
  neither sits over the charger/light area.

No Supabase function deployment is required.

Publish only after both commands pass:
  npm run build
  npx vitest run src/test/tesla-charge-monitor.test.ts
