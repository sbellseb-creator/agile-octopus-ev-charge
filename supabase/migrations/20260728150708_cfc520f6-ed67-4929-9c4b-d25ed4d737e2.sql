CREATE TABLE public.charge_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vehicle_id uuid,
  provider text NOT NULL DEFAULT 'tesla',
  tesla_vehicle_id text,
  registration text NOT NULL DEFAULT '',
  plan_date date,
  start_minutes integer NOT NULL DEFAULT 0,
  end_minutes integer,
  days_mask integer NOT NULL DEFAULT 0,
  one_time boolean NOT NULL DEFAULT true,
  charge_limit_soc numeric,
  charge_limit_sent boolean NOT NULL DEFAULT false,
  estimated_kwh numeric NOT NULL DEFAULT 0,
  estimated_cost_gbp numeric NOT NULL DEFAULT 0,
  avg_pence_per_kwh numeric NOT NULL DEFAULT 0,
  charger_kw numeric NOT NULL DEFAULT 6.9,
  status text NOT NULL DEFAULT 'app_plan',
  tesla_schedule_id bigint,
  created_by_app boolean NOT NULL DEFAULT true,
  last_error text,
  last_verified_at timestamptz,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_schedules TO authenticated;
GRANT ALL ON public.charge_schedules TO service_role;

ALTER TABLE public.charge_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own charge schedules" ON public.charge_schedules FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own charge schedules" ON public.charge_schedules FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own charge schedules" ON public.charge_schedules FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own charge schedules" ON public.charge_schedules FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_charge_schedules_updated_at BEFORE UPDATE ON public.charge_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX charge_schedules_user_idx ON public.charge_schedules (user_id, created_at DESC);