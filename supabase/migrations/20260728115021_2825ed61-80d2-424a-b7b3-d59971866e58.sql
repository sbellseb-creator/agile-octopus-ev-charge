-- Vehicles: bind to authenticated owner
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS user_id UUID;

DROP POLICY IF EXISTS "Allow public read" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public insert" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public update" ON public.vehicles;
DROP POLICY IF EXISTS "Allow public delete" ON public.vehicles;

REVOKE ALL ON public.vehicles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

CREATE POLICY "Users read own vehicles" ON public.vehicles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own vehicles" ON public.vehicles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own vehicles" ON public.vehicles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own vehicles" ON public.vehicles
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- One-time legacy claim: pre-auth rows have no owner and can be claimed by a signed-in user.
CREATE POLICY "Claim legacy unowned vehicles" ON public.vehicles
  FOR UPDATE TO authenticated USING (user_id IS NULL) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Read legacy unowned vehicles" ON public.vehicles
  FOR SELECT TO authenticated USING (user_id IS NULL);

CREATE INDEX IF NOT EXISTS vehicles_user_id_idx ON public.vehicles(user_id);

-- Tesla connections: bind to authenticated owner + rate limit bookkeeping
ALTER TABLE public.tesla_connections ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.tesla_connections ADD COLUMN IF NOT EXISTS last_wake_at TIMESTAMPTZ;
ALTER TABLE public.tesla_connections ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS tesla_connections_user_id_key ON public.tesla_connections(user_id) WHERE user_id IS NOT NULL;

-- Tesla OAuth states: expiry + owner
ALTER TABLE public.tesla_oauth_states ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.tesla_oauth_states ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes');
DELETE FROM public.tesla_oauth_states WHERE created_at < now() - interval '15 minutes';