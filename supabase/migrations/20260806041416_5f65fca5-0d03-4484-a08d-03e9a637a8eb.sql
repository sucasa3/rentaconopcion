CREATE TABLE public.home_component_service_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  action text NOT NULL DEFAULT 'replaced',
  installed_year integer,
  serviced_on date,
  brand text,
  model text,
  warranty_years integer,
  provider text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_component_service_log_user ON public.home_component_service_log (user_id, component_key, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_component_service_log TO authenticated;
GRANT ALL ON public.home_component_service_log TO service_role;

ALTER TABLE public.home_component_service_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowners manage their own component service log"
ON public.home_component_service_log FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_home_component_service_log_updated
BEFORE UPDATE ON public.home_component_service_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();