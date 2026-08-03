CREATE TABLE public.lead_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  endpoint_url text NOT NULL,
  auth_type text NOT NULL DEFAULT 'bearer',
  secret_name text,
  field_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  categories text[] NOT NULL DEFAULT '{}',
  states text[] NOT NULL DEFAULT '{}',
  metros text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT false,
  payout_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_partners TO authenticated;
GRANT ALL ON public.lead_partners TO service_role;
ALTER TABLE public.lead_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage lead partners"
  ON public.lead_partners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_lead_partners_updated
  BEFORE UPDATE ON public.lead_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lead_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.lead_partners(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  partner_lead_id text,
  http_status integer,
  error_message text,
  payload jsonb,
  response jsonb,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_handoffs_request ON public.lead_handoffs(service_request_id);
CREATE INDEX idx_lead_handoffs_status ON public.lead_handoffs(status);

GRANT SELECT ON public.lead_handoffs TO authenticated;
GRANT ALL ON public.lead_handoffs TO service_role;
ALTER TABLE public.lead_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read lead handoffs"
  ON public.lead_handoffs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_lead_handoffs_updated
  BEFORE UPDATE ON public.lead_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();