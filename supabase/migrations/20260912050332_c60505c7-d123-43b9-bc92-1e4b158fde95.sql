CREATE TABLE public.home_team_review_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  decision text NOT NULL DEFAULT 'pending',
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_team_review_state_decision_chk
    CHECK (decision IN ('pending','assigned','no_lender','unknown'))
);

CREATE UNIQUE INDEX home_team_review_state_unique_key
  ON public.home_team_review_state(agent_org_id, portfolio_client_id);
CREATE INDEX home_team_review_state_org_idx ON public.home_team_review_state(agent_org_id);
CREATE INDEX home_team_review_state_client_idx ON public.home_team_review_state(portfolio_client_id);

GRANT SELECT ON public.home_team_review_state TO authenticated;
GRANT ALL ON public.home_team_review_state TO service_role;
ALTER TABLE public.home_team_review_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Review state readable by the owning agent workspace"
  ON public.home_team_review_state FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), agent_org_id));

CREATE POLICY "Review state readable by admins"
  ON public.home_team_review_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_home_team_review_state_updated
  BEFORE UPDATE ON public.home_team_review_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();