CREATE TABLE public.signal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  action text NOT NULL CHECK (action IN ('dismiss','not_accurate')),
  evidence_version text NOT NULL,
  disputed_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, portfolio_client_id, signal_type, action)
);
GRANT SELECT, INSERT, UPDATE ON public.signal_feedback TO authenticated;
GRANT ALL ON public.signal_feedback TO service_role;
ALTER TABLE public.signal_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read their feedback" ON public.signal_feedback FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id));
CREATE POLICY "Org members add feedback" ON public.signal_feedback FOR INSERT TO authenticated
  WITH CHECK (public.is_lender_member(auth.uid(), org_id) AND created_by = auth.uid());
CREATE POLICY "Org members update feedback" ON public.signal_feedback FOR UPDATE TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id))
  WITH CHECK (public.is_lender_member(auth.uid(), org_id) AND created_by = auth.uid());