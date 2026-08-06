create table if not exists public.work_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,

  title text not null default 'Work Trip',
  notes text,

  started_at timestamptz not null default now(),
  ended_at timestamptz,

  start_odometer_miles numeric not null,
  end_odometer_miles numeric,
  distance_miles numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_trips_end_after_start
    check (ended_at is null or ended_at >= started_at),

  constraint work_trips_distance_nonnegative
    check (distance_miles is null or distance_miles >= 0)
);

create unique index if not exists work_trips_one_active_per_vehicle_idx
on public.work_trips(vehicle_id)
where ended_at is null;

create index if not exists work_trips_started_at_idx
on public.work_trips(started_at desc);

alter table public.work_trips enable row level security;
