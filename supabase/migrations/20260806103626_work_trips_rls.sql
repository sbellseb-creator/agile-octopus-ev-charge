alter table public.work_trips enable row level security;

drop policy if exists "Users can view own work trips"
on public.work_trips;

create policy "Users can view own work trips"
on public.work_trips
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own work trips"
on public.work_trips;

create policy "Users can create own work trips"
on public.work_trips
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own work trips"
on public.work_trips;

create policy "Users can update own work trips"
on public.work_trips
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own work trips"
on public.work_trips;

create policy "Users can delete own work trips"
on public.work_trips
for delete
to authenticated
using (auth.uid() = user_id);
