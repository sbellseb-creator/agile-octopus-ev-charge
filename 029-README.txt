PATCH 029 — CHARGE DATA RELIABILITY

Purpose
-------
This patch protects charge history, energy and Agile cost totals from partial
or stale Tesla observations. It deliberately does not change Home artwork.

Changes
-------
- Tesla charge_energy_added is now treated as a cumulative counter. The value
  seen at the beginning is stored as a baseline and only the delta is used.
- Start/finish observation gaps and observation counts are recorded.
- Sessions whose timing was not closely observed are marked for review and
  excluded from trusted Week/Month/Year totals until the user accepts/amends.
- Overlapping duplicate automatic Tesla sessions are suppressed.
- More charge-state fields are returned by tesla-list-vehicles, including
  actual current, charge-port latch, cumulative energy and legacy scheduled
  charging information when Tesla supplies them.
- Last-known plug/SoC behaviour remains intact.

Install in Codespaces
---------------------
1. Stop the dev server with Ctrl+C.
2. Upload this ZIP into /workspaces/agile-octopus-ev-charge.
3. Run:

   unzip -o 029-CHARGE-DATA-RELIABILITY-PATCH.zip
   npm run build

4. Deploy the updated edge function so the extra Tesla telemetry is live:

   supabase functions deploy tesla-list-vehicles

   If your normal deployment pipeline deploys Supabase functions, use that
   instead. The web app remains compatible before this function is deployed.

5. Preview or commit/push using the existing project workflow.

Trust rule
----------
The app cannot reconstruct an exact historic start time if no browser/backend
observation existed at that time. Such a record must remain visibly estimated
until the user reviews it; inventing an exact time would corrupt Agile cost.
