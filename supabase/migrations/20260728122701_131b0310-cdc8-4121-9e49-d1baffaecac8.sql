UPDATE public.charge_sessions SET local_id = id::text WHERE local_id IS NULL;
UPDATE public.work_trips SET local_id = id::text WHERE local_id IS NULL;

DROP INDEX IF EXISTS public.charge_sessions_user_local_id_key;
DROP INDEX IF EXISTS public.work_trips_user_local_id_key;

ALTER TABLE public.charge_sessions ALTER COLUMN local_id SET NOT NULL;
ALTER TABLE public.work_trips ALTER COLUMN local_id SET NOT NULL;

ALTER TABLE public.charge_sessions
  ADD CONSTRAINT charge_sessions_user_local_id_uniq UNIQUE (user_id, local_id);
ALTER TABLE public.work_trips
  ADD CONSTRAINT work_trips_user_local_id_uniq UNIQUE (user_id, local_id);