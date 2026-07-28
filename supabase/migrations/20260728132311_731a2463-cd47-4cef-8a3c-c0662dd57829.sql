-- Vehicle identity fields
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS registration text,
  ADD COLUMN IF NOT EXISTS vin text,
  ADD COLUMN IF NOT EXISTS tesla_vehicle_id text,
  ADD COLUMN IF NOT EXISTS car_type text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Battery capacity is optional (never invented)
ALTER TABLE public.vehicles ALTER COLUMN battery_kwh DROP NOT NULL;

-- Registration shown on charge sessions
ALTER TABLE public.charge_sessions
  ADD COLUMN IF NOT EXISTS vehicle_registration text;

-- Central settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS charger_amps numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS charger_kw numeric NOT NULL DEFAULT 6.9,
  ADD COLUMN IF NOT EXISTS charging_location text NOT NULL DEFAULT 'Home',
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'F',
  ADD COLUMN IF NOT EXISTS tariff text NOT NULL DEFAULT 'agile',
  ADD COLUMN IF NOT EXISTS petrol_price_ppl numeric NOT NULL DEFAULT 134.9,
  ADD COLUMN IF NOT EXISTS diesel_price_ppl numeric NOT NULL DEFAULT 142.9,
  ADD COLUMN IF NOT EXISTS petrol_mpg numeric NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS diesel_mpg numeric NOT NULL DEFAULT 55,
  ADD COLUMN IF NOT EXISTS notify_cheap_slots boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_charge_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_price_alerts boolean NOT NULL DEFAULT false;