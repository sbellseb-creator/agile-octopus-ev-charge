CREATE TABLE public.vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  make TEXT DEFAULT '',
  model TEXT DEFAULT '',
  battery_kwh NUMERIC NOT NULL,
  charge_efficiency_pct NUMERIC NOT NULL DEFAULT 90,
  miles_per_kwh NUMERIC DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  color TEXT DEFAULT '#22c55e',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.vehicles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete" ON public.vehicles FOR DELETE USING (true);