-- Web Push subscriptions (one row per browser/device) with per-type opt-in.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  region text not null default 'F',
  notify_estimate boolean not null default true,
  notify_official boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can view own push subscriptions" on public.push_subscriptions;
create policy "Users can view own push subscriptions" on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can create own push subscriptions" on public.push_subscriptions;
create policy "Users can create own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions" on public.push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

-- De-duplication log for scheduled sends. Service role only (RLS on, no policies).
create table if not exists public.notification_log (
  key text primary key,
  type text not null,
  region text not null,
  target_date date not null,
  sent_at timestamptz not null default now()
);

alter table public.notification_log enable row level security;
