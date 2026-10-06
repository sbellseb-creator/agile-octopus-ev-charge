# Welcome to your Lovable project

TODO: Document your project here

## Crystal Ball & push notifications

A separate **Crystal Ball** tab shows *estimated* next-day Agile rates for the region in `src/lib/agile-config.ts` (`AGILE_REGION`, default `F` = North Eastern England). Official rates replace the estimate (with a comparison) once published (~16:00 UK).

### How estimates work
`supabase/functions/crystal-ball` pulls half-hourly wholesale prices via a `WholesaleProvider` (`supabase/functions/_shared/crystal-provider.ts`) and applies the Agile formula (`_shared/agile-core.ts`: multiplier, peak adder 16:00-19:00, VAT, cap, floor). The browser only calls the edge function.

- Default provider: Nord Pool Data Portal day-ahead auction results for GB (public API; override with `NORDPOOL_API_URL` / `NORDPOOL_DELIVERY_AREA`). The auction closes ~11:00 UK and results appear ~11:30–11:42 UK; until then the API returns no data and the tab shows a waiting state (`available: false`). Implement `WholesaleProvider` to swap in another source.
- `CRYSTAL_PROVIDER=mock` is an explicit opt-in, clearly flagged placeholder (fake data) for UI testing only; it is never the default.
- Formula constants are **defaults that must be verified against current Octopus Agile terms**. Override with function secrets: `AGILE_MULTIPLIER`, `AGILE_PEAK_ADDER`, `AGILE_PEAK_START_HOUR`, `AGILE_PEAK_END_HOUR`, `AGILE_VAT_FACTOR`, `AGILE_CAP`, `AGILE_FLOOR`; `AGILE_REGION`, `AGILE_PRODUCT_CODE` also configurable.

### Push notification setup
1. Generate VAPID keys: `npx web-push generate-vapid-keys`.
2. Frontend env: `VITE_VAPID_PUBLIC_KEY=<public key>`.
3. Edge function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`), `CRON_SECRET` (random string).
4. Apply migration `supabase/migrations/20260901090000_push_notifications.sql` (creates `push_subscriptions` with RLS so users only access their own rows, and a service-role-only `notification_log` for de-duplication).
5. Deploy functions: `supabase functions deploy crystal-ball push-notify`.
6. Schedule `push-notify` (Supabase cron / pg_cron + pg_net, or any scheduler) **every 5 minutes between 10:00 and 19:00 UTC** with `POST` and header `x-cron-secret: <CRON_SECRET>`. The function itself works out Europe/London time (incl. DST): estimate notification only fires 11:30–14:00 UK once the day-ahead auction result exists and tomorrow's estimate exists, official one 16:00–19:00 UK once ≥46 official slots exist; each type/day is sent at most once.
7. In the Crystal Ball tab, enable each notification type and use **Send test notification**.

iOS/iPadOS only delivers web push to a PWA **added to the Home Screen** (iOS 16.4+).

### Not included (follow-ups)
- "Provisional" Charge planner preview using estimated prices (nothing is ever sent to Tesla from estimates).
- The older static placeholder card `AgileCrystalBall` on the Agile tab still shows hard-coded sample numbers; consider replacing it with real data.
