PATCH 030 — CONSOLIDATED HOME RELIABILITY AND POLISH

Included in this checkpoint
---------------------------
1. False long-duration, low-energy Tesla observations are quarantined from totals.
2. Every recent charge can be reviewed/amended or deleted; uncertain estimates can be accepted.
3. Agile recommendations distinguish:
   - the lowest individual half-hour slot; and
   - the best continuous block long enough to reach the selected Tesla charge target.
   The misleading “Cheapest route” wording has been removed.
4. Agile is restored as a primary navigation tab.
5. Cockpit team decoration is moved off the HMI and becomes a mirror air freshener.
6. Air-freshener choices include football teams, apple, lemon, paw and none.
7. Existing weather photography, themes, Tesla schedules, last-known SoC/status,
   mouse buttons, wheel scrolling, touch swiping and Fold responsive layout are retained.

Important data rule
-------------------
An automatically observed charge is not included in Week/Month/Year totals when its
elapsed time is implausible for the recorded energy. It remains visible for review.

Install and verify
------------------
unzip -o 030-CONSOLIDATED-HOME-RELIABILITY-POLISH.zip
npm run build
npx vitest run src/test/tesla-charge-monitor.test.ts

Publish
-------
git add 030-README.txt src/components/HomeDashboard.tsx src/components/home/HomeHeroScene.tsx src/pages/Index.tsx
git diff --cached --check
git commit -m "Consolidate Home reliability planning and cockpit polish"
git push origin main

No Supabase Edge Function deployment is required for this patch.
