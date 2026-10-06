-- Schedules the push-notify edge function every 5 minutes, 10:00-18:55 UTC
-- (covers 11:30-13:00 and 16:00-19:00 UK in both GMT and BST). The function
-- decides whether anything is due and de-duplicates, so extra runs are harmless.
-- Replace <PROJECT_REF> and <CRON_SECRET> (same value as the CRON_SECRET function secret).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('push-notify') where exists (select 1 from cron.job where jobname = 'push-notify');

select cron.schedule(
  'push-notify',
  '*/5 10-18 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
