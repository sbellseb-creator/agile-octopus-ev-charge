# Welcome to your Lovable project

TODO: Document your project here

## Crystal Ball & push notifications

A separate **Crystal Ball** tab shows *estimated* next-day Agile rates for the region in `src/lib/agile-config.ts` (`AGILE_REGION`, default `F` = North Eastern England). Official rates replace the estimate (with a comparison) once published (~16:00 UK).

### How estimates work
`supabase/functions/crystal-ball` pulls half-hourly wholesale prices via a `WholesaleProvider` (`supabase/functions/_shared/crystal-provider.ts`) and applies the Agile formula (`_shared/agile-core.ts`: multiplier, peak adder 16:00-19:00, VAT, cap, floor). The browser only calls the edge function (POST `{region, date}`) and gets `status: available | waiting | error` (with the real error reason).

#### Data sources: what was wrong and what is free
- **Root cause of the empty tab:** the previous default, the Nord Pool Data Portal `DayAheadPrices` API, is *not* a free/keyless API (it needs a Nord Pool subscription and bearer token). Unauthenticated calls get HTTP 401/403, which the function turned into a generic "Couldn't load estimates", so the tab never showed data, at any time of day. (Found by code review and Nord Pool's API terms; the development sandbox had no outbound network, so this could not be confirmed live: use **Run check** in the tab, or the function logs, to confirm on your project.)
- **No free source of GB next-day auction prices exists.** The Elexon Market Index (`APXMIDP`) is *settlement* data published per period as it is delivered, so it can never provide tomorrow. ENTSO-E does not cover GB since Brexit. EPEX/N2EX publish GB day-ahead results only via licensed feeds.
- Provider selection (`getProvider`): `CRYSTAL_PROVIDER=mock|nordpool|elexon` forces one; otherwise Nord Pool is used if the `NORDPOOL_API_TOKEN` secret is set (also `NORDPOOL_API_URL`, `NORDPOOL_DELIVERY_AREA`); without a token **today and past days use Elexon MID (keyless)** so the previous-days selector and calibration work (`ELEXON_MID_PROVIDER`, default `APXMIDP`; zero-volume placeholder rows are dropped), and **future days report "not configured"** instead of guessing. Implement `WholesaleProvider` to add another keyed source.
- `CRYSTAL_PROVIDER=mock` is an explicit opt-in, clearly flagged placeholder (fake data) for UI testing only.
- Every request logs one JSON line: provider, requested range, rows returned and failure reason. `crystal-ball` with `{"diagnose": true}` (the **Run check** button) tests the provider for the last 7 days and tomorrow, compares estimate vs official Agile rates for your region per day (average difference, mean absolute slot error) and suggests multiplier/peak-adder constants fitted to the official rates.

#### Formula constants
Defaults (multiplier 2.2, peak adder 12p 16:00-19:00, VAT 1.05, cap 100p, floor -25p) follow the published Agile Octopus structure but **have not been verified against region F data** (no network when this was written). Run the check, compare the fitted values, and override with function secrets: `AGILE_MULTIPLIER`, `AGILE_PEAK_ADDER`, `AGILE_PEAK_START_HOUR`, `AGILE_PEAK_END_HOUR`, `AGILE_VAT_FACTOR`, `AGILE_CAP`, `AGILE_FLOOR`; `AGILE_REGION` and `AGILE_PRODUCT_CODE` (Octopus may issue a new product code, e.g. after the April 2026 levy changes) are also configurable.

### Push notification setup
1. Generate VAPID keys: `npx web-push generate-vapid-keys`.
2. Frontend build: add a GitHub Actions **variable** `VITE_VAPID_PUBLIC_KEY=<public key>` (alongside `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`); `.github/workflows/deploy.yml` passes them to the Pages build. For local/Lovable builds set the same env var. Redeploy.
3. Edge function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`), `CRON_SECRET` (random string), and `NORDPOOL_API_TOKEN` if you have a Nord Pool subscription: `supabase secrets set ...`.
4. Apply migration `supabase/migrations/20260901090000_push_notifications.sql` (`supabase db push`).
5. Deploy: `supabase functions deploy crystal-ball push-notify`.
6. Schedule `push-notify` every 5 minutes: run `supabase/cron/push-notify-schedule.sql` in the SQL editor (after replacing `<PROJECT_REF>` and `<CRON_SECRET>`). It runs `*/5` for 10:00-18:55 UTC, which covers both GMT and BST; the function itself works out Europe/London time: the estimate notification fires **11:30-13:00 UK** once tomorrow's wholesale-based estimate exists, the official one **16:00-19:00 UK** once ≥46 official slots exist; each type/day is sent at most once.
7. In the Crystal Ball tab enable each notification type and press **Send test notification**. The line under the card shows `Push: configured / permission / subscribed / last test`.

The push service worker (`public/push-sw.js`) registers at `${BASE_URL}push-sw.js` and resolves icons/links relative to its scope, so it works under a sub-path. iOS/iPadOS only delivers web push to a PWA **added to the Home Screen** (iOS 16.4+).

### Not included (follow-ups)
- "Provisional" Charge planner preview using estimated prices (nothing is ever sent to Tesla from estimates).
- The older static placeholder card `AgileCrystalBall` on the Agile tab still shows hard-coded sample numbers; consider replacing it with real data.

## Agile Crystal Ball

Client-side tab that estimates tomorrow's Octopus Agile rates (region F) from Elexon day-ahead/market-index wholesale prices, and switches to the official Octopus rates once published (~16:00 UK). Formula constants live at the top of `src/lib/agileForecast.ts`. Estimates may differ from official rates.
