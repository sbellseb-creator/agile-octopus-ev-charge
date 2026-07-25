
CREATE TABLE public.tesla_connections (
  device_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  region TEXT NOT NULL DEFAULT 'eu',
  vehicles JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tesla_oauth_states (
  state TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No grants to anon/authenticated: only service_role (edge functions) touches these.
GRANT ALL ON public.tesla_connections TO service_role;
GRANT ALL ON public.tesla_oauth_states TO service_role;

ALTER TABLE public.tesla_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tesla_oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies: locked to service_role only.
