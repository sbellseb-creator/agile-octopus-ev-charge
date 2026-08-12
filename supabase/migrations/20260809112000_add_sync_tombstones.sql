CREATE TABLE IF NOT EXISTS public.sync_tombstones (
  user_id uuid NOT NULL,
  table_name text NOT NULL,
  local_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sync_tombstones_pkey
    PRIMARY KEY (user_id, table_name, local_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.sync_tombstones TO authenticated;

GRANT ALL
  ON public.sync_tombstones TO service_role;

ALTER TABLE public.sync_tombstones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sync_tombstones'
      AND policyname = 'Users manage own sync tombstones'
  ) THEN
    CREATE POLICY "Users manage own sync tombstones"
      ON public.sync_tombstones
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END
$$;
