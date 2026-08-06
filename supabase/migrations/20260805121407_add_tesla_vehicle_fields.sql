alter table public.vehicles
add column if not exists source text default 'manual',
add column if not exists vin text,
add column if not exists registration text,
add column if not exists tesla_vehicle_id text,
add column if not exists paint_colour text;

create index if not exists vehicles_tesla_vehicle_id_idx
on public.vehicles(tesla_vehicle_id);

create index if not exists vehicles_vin_idx
on public.vehicles(vin);