-- ============ charge_sessions ============
CREATE TABLE public.charge_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  -- stable identity of the original localStorage record, used to de-duplicate imports
  local_id text,
  source_device text,

  session_date date NOT NULL,
  start_time timestamptz,
  end_time timestamptz,

  vehicle_id text,
  vehicle_name text NOT NULL DEFAULT '',
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

  -- ---- Learning Engine capture fields (populated later; no calculations yet) ----
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX charge_sessions_user_local_id_key
  ON public.charge_sessions (user_id, local_id) WHERE local_id IS NOT NULL;
CREATE INDEX charge_sessions_user_date_idx ON public.charge_sessions (user_id, session_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_sessions TO authenticated;
GRANT ALL ON public.charge_sessions TO service_role;
ALTER TABLE public.charge_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own charge sessions" ON public.charge_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own charge sessions" ON public.charge_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own charge sessions" ON public.charge_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own charge sessions" ON public.charge_sessions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ work_trips ============
CREATE TABLE public.work_trips (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  local_id text,
  source_device text,

  trip_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  miles numeric NOT NULL DEFAULT 0,
  rate_pence_per_mile numeric NOT NULL DEFAULT 15,
  extra_charges jsonb NOT NULL DEFAULT '[]'::jsonb,
  charge_session_ids jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX work_trips_user_local_id_key
  ON public.work_trips (user_id, local_id) WHERE local_id IS NOT NULL;
CREATE INDEX work_trips_user_date_idx ON public.work_trips (user_id, trip_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_trips TO authenticated;
GRANT ALL ON public.work_trips TO service_role;
ALTER TABLE public.work_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own work trips" ON public.work_trips
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own work trips" ON public.work_trips
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own work trips" ON public.work_trips
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own work trips" ON public.work_trips
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ user_settings ============
CREATE TABLE public.user_settings (
  user_id uuid NOT NULL PRIMARY KEY,
  work_rate_pence_per_mile numeric NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings" ON public.user_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_charge_sessions_updated_at BEFORE UPDATE ON public.charge_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_work_trips_updated_at BEFORE UPDATE ON public.work_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();