DROP POLICY IF EXISTS "Read legacy unowned vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Claim legacy unowned vehicles" ON public.vehicles;

REVOKE ALL ON public.vehicles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

REVOKE ALL ON public.tesla_connections FROM anon, authenticated;
REVOKE ALL ON public.tesla_oauth_states FROM anon, authenticated;
GRANT ALL ON public.tesla_connections TO service_role;
GRANT ALL ON public.tesla_oauth_states TO service_role;