ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS home_latitude numeric,
  ADD COLUMN IF NOT EXISTS home_longitude numeric;