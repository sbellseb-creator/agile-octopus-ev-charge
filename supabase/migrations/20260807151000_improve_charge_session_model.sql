-- Improve charge-session provenance and measurement model.
--
-- Additive only: existing columns remain in place so historical data and the
-- current frontend continue to work while the application migrates gradually.

ALTER TABLE public.charge_sessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',

  -- Canonical lifecycle timestamps. Existing start_time/end_time remain
  -- temporarily for backwards compatibility.
  ADD COLUMN IF NOT EXISTS plugged_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS unplugged_at timestamptz,

  -- Energy provenance.
  -- NULL means "not measured / unknown"; zero is therefore a real measurement.
  ADD COLUMN IF NOT EXISTS battery_energy_kwh numeric,
  ADD COLUMN IF NOT EXISTS measured_grid_energy_kwh numeric,
  ADD COLUMN IF NOT EXISTS estimated_grid_energy_kwh numeric,

  -- How battery_energy_kwh was obtained.
  ADD COLUMN IF NOT EXISTS energy_source text,

  -- Import provenance allows recovered historical data to be distinguished
  -- permanently from sessions created by the owned backend.
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS import_source text;

ALTER TABLE public.charge_sessions
  DROP CONSTRAINT IF EXISTS charge_sessions_source_check;

ALTER TABLE public.charge_sessions
  ADD CONSTRAINT charge_sessions_source_check
  CHECK (source IN ('tesla', 'manual', 'imported'));

ALTER TABLE public.charge_sessions
  DROP CONSTRAINT IF EXISTS charge_sessions_status_check;

ALTER TABLE public.charge_sessions
  ADD CONSTRAINT charge_sessions_status_check
  CHECK (status IN ('charging', 'paused', 'completed', 'interrupted', 'manual'));

ALTER TABLE public.charge_sessions
  DROP CONSTRAINT IF EXISTS charge_sessions_energy_source_check;

ALTER TABLE public.charge_sessions
  ADD CONSTRAINT charge_sessions_energy_source_check
  CHECK (
    energy_source IS NULL OR
    energy_source IN ('tesla', 'grid_meter', 'time_estimate', 'soc_estimate', 'manual', 'imported')
  );

ALTER TABLE public.charge_sessions
  DROP CONSTRAINT IF EXISTS charge_sessions_battery_energy_nonnegative;

ALTER TABLE public.charge_sessions
  ADD CONSTRAINT charge_sessions_battery_energy_nonnegative
  CHECK (battery_energy_kwh IS NULL OR battery_energy_kwh >= 0);

ALTER TABLE public.charge_sessions
  DROP CONSTRAINT IF EXISTS charge_sessions_measured_grid_energy_nonnegative;

ALTER TABLE public.charge_sessions
  ADD CONSTRAINT charge_sessions_measured_grid_energy_nonnegative
  CHECK (measured_grid_energy_kwh IS NULL OR measured_grid_energy_kwh >= 0);

ALTER TABLE public.charge_sessions
  DROP CONSTRAINT IF EXISTS charge_sessions_estimated_grid_energy_nonnegative;

ALTER TABLE public.charge_sessions
  ADD CONSTRAINT charge_sessions_estimated_grid_energy_nonnegative
  CHECK (estimated_grid_energy_kwh IS NULL OR estimated_grid_energy_kwh >= 0);

CREATE INDEX IF NOT EXISTS charge_sessions_started_at_idx
  ON public.charge_sessions (started_at);

CREATE INDEX IF NOT EXISTS charge_sessions_source_idx
  ON public.charge_sessions (source);
