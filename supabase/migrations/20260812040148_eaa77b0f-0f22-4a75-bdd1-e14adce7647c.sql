CREATE TABLE public.home_value_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address_normalized text,
  value_cents bigint NOT NULL,
  source text NOT NULL DEFAULT 'avm',
  captured_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, captured_on)
);

CREATE INDEX idx_home_value_snapshots_user_date
  ON public.home_value_snapshots (user_id, captured_on DESC);

GRANT SELECT, INSERT ON public.home_value_snapshots TO authenticated;
GRANT ALL ON public.home_value_snapshots TO service_role;

ALTER TABLE public.home_value_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowners read their own value history"
  ON public.home_value_snapshots FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Homeowners record their own value history"
  ON public.home_value_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_home_value_snapshots_updated
  BEFORE UPDATE ON public.home_value_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();