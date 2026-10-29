CREATE TABLE public.batchdata_reverse_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id),
  requested_by uuid NOT NULL,
  input_phone text,
  input_email text,
  status text NOT NULL DEFAULT 'pending',
  person_count integer NOT NULL DEFAULT 0,
  persons jsonb NOT NULL DEFAULT '[]'::jsonb,
  multi_person_flag boolean NOT NULL DEFAULT false,
  name_evidence text,
  provider_request_id text,
  http_status integer,
  error_message text,
  estimated_cost_cents integer NOT NULL DEFAULT 0,
  billing_basis text NOT NULL DEFAULT 'estimated',
  review_state text NOT NULL DEFAULT 'pending',
  approved_property jsonb,
  handed_off_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX batchdata_reverse_lookups_client_idx ON public.batchdata_reverse_lookups (portfolio_client_id, created_at DESC);
CREATE INDEX batchdata_reverse_lookups_org_idx ON public.batchdata_reverse_lookups (org_id, created_at DESC);

GRANT SELECT ON public.batchdata_reverse_lookups TO authenticated;
GRANT ALL ON public.batchdata_reverse_lookups TO service_role;

ALTER TABLE public.batchdata_reverse_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY reverse_lookups_select_member ON public.batchdata_reverse_lookups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lender_members m
      WHERE m.user_id = auth.uid() AND m.lender_org_id = org_id
    )
  );