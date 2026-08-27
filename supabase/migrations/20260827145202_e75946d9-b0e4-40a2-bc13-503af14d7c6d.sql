CREATE TABLE public.data_provider_health (
  provider text NOT NULL,
  endpoint text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 1,
  unauthorized_count integer NOT NULL DEFAULT 0,
  last_unauthorized_at timestamp with time zone,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, endpoint)
);

GRANT SELECT ON public.data_provider_health TO authenticated;
GRANT ALL ON public.data_provider_health TO service_role;

ALTER TABLE public.data_provider_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider health"
  ON public.data_provider_health
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read provider health"
  ON public.data_provider_health
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.batchdata_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  address_normalized text,
  requested_by uuid REFERENCES auth.users(id),
  cache_hit boolean NOT NULL DEFAULT false,
  cost_cents integer NOT NULL DEFAULT 0,
  status integer,
  error_message text,
  revenue_source text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.batchdata_call_log TO authenticated;
GRANT ALL ON public.batchdata_call_log TO service_role;

ALTER TABLE public.batchdata_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage batchdata call log"
  ON public.batchdata_call_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can read their own batchdata calls"
  ON public.batchdata_call_log
  FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_provider_health_updated
  BEFORE UPDATE ON public.data_provider_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults: ATTOM primary (priority 1), BatchData fallback (priority 2)
INSERT INTO public.data_provider_health (provider, endpoint, enabled, priority)
VALUES
  ('attom', 'avm', true, 1),
  ('attom', 'detail', true, 1),
  ('attom', 'tax', true, 1),
  ('attom', 'sales', true, 1),
  ('attom', 'permits', true, 1),
  ('attom', 'neighborhood', true, 1),
  ('attom', 'risk', true, 1),
  ('attom', 'owner', true, 1),
  ('attom', 'mortgage', true, 1),
  ('batchdata', 'avm', true, 2),
  ('batchdata', 'detail', true, 2),
  ('batchdata', 'tax', true, 2),
  ('batchdata', 'sales', true, 2),
  ('batchdata', 'permits', true, 2),
  ('batchdata', 'neighborhood', true, 2),
  ('batchdata', 'risk', true, 2),
  ('batchdata', 'owner', true, 2),
  ('batchdata', 'mortgage', true, 2)
ON CONFLICT (provider, endpoint) DO NOTHING;
