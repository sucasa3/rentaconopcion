CREATE TABLE public.homeowner_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_key text NOT NULL,
  signal_type text NOT NULL,
  title text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, signal_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.homeowner_alerts TO authenticated;
GRANT ALL ON public.homeowner_alerts TO service_role;

ALTER TABLE public.homeowner_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowners manage their own alerts"
ON public.homeowner_alerts FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_homeowner_alerts_updated_at
BEFORE UPDATE ON public.homeowner_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_homeowner_alerts_user ON public.homeowner_alerts (user_id, dismissed_at);