ALTER TABLE public.tesla_connections
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.tesla_connections
  ADD COLUMN IF NOT EXISTS last_wake_at timestamptz;

ALTER TABLE public.tesla_connections
  ADD COLUMN IF NOT EXISTS last_poll_at timestamptz;

ALTER TABLE public.tesla_connections
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS tesla_connections_user_id_key
  ON public.tesla_connections(user_id)
  WHERE user_id IS NOT NULL;
