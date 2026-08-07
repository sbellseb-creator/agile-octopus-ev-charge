-- Cloud-sync schema for the independently owned Supabase project.
--
-- Important:
--   public.work_trips remains dedicated to Tesla odometer trips.
--   The older manual Work Summary records use public.work_cost_trips.

-- ============================================================
-- Shared updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Charging sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.charge_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id text NOT NULL,
  source_device text,

  session_date date NOT NULL,
  start_time timestamptz,
  end_time timestamptz,

  vehicle_id text,
  vehicle_name text NOT NULL DEFAULT '',
  vehicle_registration text,
  charge_mode text NOT NULL DEFAULT 'immediate',
  target_time timestamptz,

  start_soc numeric NOT NULL DEFAULT 0,
  end_soc numeric NOT NULL DEFAULT 0,
  energy_added_kwh numeric NOT NULL DEFAULT 0,
  grid_kwh numeric NOT NULL DEFAULT 0,
  total_cost_gbp numeric NOT NULL DEFAULT 0,
  avg_pence_per_kwh numeric NOT NULL DEFAULT 0,
  num_slots numeric NOT NULL DEFAULT 0,
  tariff_code text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  region text,

  slot_prices jsonb NOT NULL DEFAULT '[]'::jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,

  planned_start timestamptz,
  actual_start timestamptz,
  planned_finish timestamptz,
  actual_finish timestamptz,
  planned_cost_gbp numeric,
  actual_cost_gbp numeric,
  configured_charger_kw numeric,
  observed_charger_kw numeric,
  charging_efficiency_pct numeric,
  charging_location text,
  predicted_energy_kwh numeric,
  actual_energy_kwh numeric,
  outside_temp_c numeric,
  confidence_score numeric,
  raw_observations jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT charge_sessions_user_local_id_uniq
    UNIQUE (user_id, local_id)
);

CREATE INDEX IF NOT EXISTS charge_sessions_user_date_idx
  ON public.charge_sessions (user_id, session_date);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.charge_sessions TO authenticated;

GRANT ALL
  ON public.charge_sessions TO service_role;

ALTER TABLE public.charge_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'charge_sessions'
      AND policyname = 'Users read own charge sessions'
  ) THEN
    CREATE POLICY "Users read own charge sessions"
      ON public.charge_sessions
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'charge_sessions'
      AND policyname = 'Users insert own charge sessions'
  ) THEN
    CREATE POLICY "Users insert own charge sessions"
      ON public.charge_sessions
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'charge_sessions'
      AND policyname = 'Users update own charge sessions'
  ) THEN
    CREATE POLICY "Users update own charge sessions"
      ON public.charge_sessions
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'charge_sessions'
      AND policyname = 'Users delete own charge sessions'
  ) THEN
    CREATE POLICY "Users delete own charge sessions"
      ON public.charge_sessions
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

DROP TRIGGER IF EXISTS update_charge_sessions_updated_at
  ON public.charge_sessions;

CREATE TRIGGER update_charge_sessions_updated_at
BEFORE UPDATE ON public.charge_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Manual Work Summary trips
-- Separate from Tesla odometer-based public.work_trips
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_cost_trips (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id text NOT NULL,
  source_device text,

  trip_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  miles numeric NOT NULL DEFAULT 0,
  rate_pence_per_mile numeric NOT NULL DEFAULT 15,
  extra_charges jsonb NOT NULL DEFAULT '[]'::jsonb,
  charge_session_ids jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_cost_trips_user_local_id_uniq
    UNIQUE (user_id, local_id)
);

CREATE INDEX IF NOT EXISTS work_cost_trips_user_date_idx
  ON public.work_cost_trips (user_id, trip_date);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.work_cost_trips TO authenticated;

GRANT ALL
  ON public.work_cost_trips TO service_role;

ALTER TABLE public.work_cost_trips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'work_cost_trips'
      AND policyname = 'Users read own work cost trips'
  ) THEN
    CREATE POLICY "Users read own work cost trips"
      ON public.work_cost_trips
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'work_cost_trips'
      AND policyname = 'Users insert own work cost trips'
  ) THEN
    CREATE POLICY "Users insert own work cost trips"
      ON public.work_cost_trips
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'work_cost_trips'
      AND policyname = 'Users update own work cost trips'
  ) THEN
    CREATE POLICY "Users update own work cost trips"
      ON public.work_cost_trips
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'work_cost_trips'
      AND policyname = 'Users delete own work cost trips'
  ) THEN
    CREATE POLICY "Users delete own work cost trips"
      ON public.work_cost_trips
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END
$$;

DROP TRIGGER IF EXISTS update_work_cost_trips_updated_at
  ON public.work_cost_trips;

CREATE TRIGGER update_work_cost_trips_updated_at
BEFORE UPDATE ON public.work_cost_trips
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- User settings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid NOT NULL PRIMARY KEY,

  work_rate_pence_per_mile numeric NOT NULL DEFAULT 15,
  charger_amps numeric NOT NULL DEFAULT 30,
  charger_kw numeric NOT NULL DEFAULT 6.9,
  charging_location text NOT NULL DEFAULT 'Home',
  region text NOT NULL DEFAULT 'F',
  tariff text NOT NULL DEFAULT 'agile',

  petrol_price_ppl numeric NOT NULL DEFAULT 134.9,
  diesel_price_ppl numeric NOT NULL DEFAULT 142.9,
  petrol_mpg numeric NOT NULL DEFAULT 45,
  diesel_mpg numeric NOT NULL DEFAULT 55,

  notify_cheap_slots boolean NOT NULL DEFAULT false,
  notify_charge_complete boolean NOT NULL DEFAULT false,
  notify_price_alerts boolean NOT NULL DEFAULT false,

  home_latitude numeric,
  home_longitude numeric,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.user_settings TO authenticated;

GRANT ALL
  ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_settings'
      AND policyname = 'Users manage own settings'
  ) THEN
    CREATE POLICY "Users manage own settings"
      ON public.user_settings
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END
$$;

DROP TRIGGER IF EXISTS update_user_settings_updated_at
  ON public.user_settings;

CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
