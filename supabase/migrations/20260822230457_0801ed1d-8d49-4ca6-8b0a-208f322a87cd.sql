-- 1. Recommended action per opportunity, per audience -----------------------
CREATE TABLE public.opportunity_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.homeowner_opportunities(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('agent','lender')),
  temperature text NOT NULL CHECK (temperature IN ('hot','warm','nurture')),
  rank_score integer NOT NULL DEFAULT 0,
  channel text NOT NULL CHECK (channel IN ('call','text','email')),
  action_key text NOT NULL,
  headline text NOT NULL,
  why text NOT NULL,
  draft_subject text,
  draft_body text,
  draft_model text,
  drafted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, audience)
);
GRANT SELECT ON public.opportunity_actions TO authenticated;
GRANT ALL ON public.opportunity_actions TO service_role;
ALTER TABLE public.opportunity_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read recommended actions"
  ON public.opportunity_actions FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_opportunity_actions_updated BEFORE UPDATE ON public.opportunity_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_opportunity_actions_org ON public.opportunity_actions(org_id, temperature, rank_score DESC);

-- 2. Outreach messages -------------------------------------------------------
CREATE TABLE public.outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.homeowner_opportunities(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  channel text NOT NULL CHECK (channel IN ('call','text','email')),
  subject text,
  body text,
  recipient_email text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.outreach_messages TO authenticated;
GRANT ALL ON public.outreach_messages TO service_role;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read their outreach"
  ON public.outreach_messages FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_outreach_messages_updated BEFORE UPDATE ON public.outreach_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_outreach_messages_client ON public.outreach_messages(portfolio_client_id, created_at DESC);
CREATE INDEX idx_outreach_messages_org ON public.outreach_messages(org_id, created_at DESC);

-- 3. Outreach events ---------------------------------------------------------
CREATE TABLE public.outreach_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.homeowner_opportunities(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.outreach_messages(id) ON DELETE CASCADE,
  campaign_send_id uuid REFERENCES public.campaign_sends(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('sent','open','click','reply','app_activity')),
  detail text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.outreach_events TO authenticated;
GRANT ALL ON public.outreach_events TO service_role;
ALTER TABLE public.outreach_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read outreach events"
  ON public.outreach_events FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_outreach_events_org ON public.outreach_events(org_id, occurred_at DESC);
CREATE INDEX idx_outreach_events_client ON public.outreach_events(portfolio_client_id, occurred_at DESC);

-- 4. One-tap outcomes --------------------------------------------------------
CREATE TABLE public.opportunity_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.homeowner_opportunities(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id),
  stage text NOT NULL CHECK (stage IN ('no_answer','talked','appointment','application','closed','not_interested')),
  value_cents bigint,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.opportunity_outcomes TO authenticated;
GRANT ALL ON public.opportunity_outcomes TO service_role;
ALTER TABLE public.opportunity_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read outcomes"
  ON public.opportunity_outcomes FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Org members log outcomes"
  ON public.opportunity_outcomes FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'))
  );
CREATE INDEX idx_opportunity_outcomes_org ON public.opportunity_outcomes(org_id, occurred_at DESC);
CREATE INDEX idx_opportunity_outcomes_client ON public.opportunity_outcomes(portfolio_client_id, occurred_at DESC);

-- 5. Shared agent + lender opportunities -------------------------------------
CREATE TABLE public.shared_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.agent_lender_connections(id) ON DELETE CASCADE,
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  agent_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  lender_opportunity_id uuid REFERENCES public.homeowner_opportunities(id) ON DELETE SET NULL,
  agent_opportunity_id uuid REFERENCES public.homeowner_opportunities(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','handed_off','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_client_id, lender_org_id, agent_org_id)
);
GRANT SELECT ON public.shared_opportunities TO authenticated;
GRANT ALL ON public.shared_opportunities TO service_role;
ALTER TABLE public.shared_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Both sides read a shared opportunity"
  ON public.shared_opportunities FOR SELECT TO authenticated
  USING (
    public.is_lender_member(auth.uid(), lender_org_id)
    OR public.is_lender_member(auth.uid(), agent_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE TRIGGER trg_shared_opportunities_updated BEFORE UPDATE ON public.shared_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Funnel / ROI rollup -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_funnel(_org_id uuid, _since timestamptz DEFAULT (now() - interval '90 days'))
RETURNS TABLE(
  homeowners integer,
  opportunities integer,
  contacted integer,
  engaged integer,
  conversations integer,
  appointments integer,
  applications integer,
  closed integer,
  closed_value_cents bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_lender_member(auth.uid(), _org_id)
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: not a member of this organization';
  END IF;

  RETURN QUERY
  WITH cl AS (
    SELECT c.id
      FROM public.lender_portfolio_clients c
      JOIN public.lender_portfolios p ON p.id = c.portfolio_id
     WHERE p.lender_org_id = _org_id
  )
  SELECT
    (SELECT count(*)::int FROM cl),
    (SELECT count(*)::int FROM public.homeowner_opportunities o
      WHERE o.org_id = _org_id AND o.created_at >= _since),
    (SELECT count(DISTINCT e.portfolio_client_id)::int FROM public.outreach_events e
      WHERE e.org_id = _org_id AND e.event = 'sent' AND e.occurred_at >= _since),
    (SELECT count(DISTINCT e.portfolio_client_id)::int FROM public.outreach_events e
      WHERE e.org_id = _org_id AND e.event IN ('open','click','reply','app_activity') AND e.occurred_at >= _since),
    (SELECT count(DISTINCT x.portfolio_client_id)::int FROM public.opportunity_outcomes x
      WHERE x.org_id = _org_id AND x.stage IN ('talked','appointment','application','closed') AND x.occurred_at >= _since),
    (SELECT count(DISTINCT x.portfolio_client_id)::int FROM public.opportunity_outcomes x
      WHERE x.org_id = _org_id AND x.stage IN ('appointment','application','closed') AND x.occurred_at >= _since),
    (SELECT count(DISTINCT x.portfolio_client_id)::int FROM public.opportunity_outcomes x
      WHERE x.org_id = _org_id AND x.stage IN ('application','closed') AND x.occurred_at >= _since),
    (SELECT count(DISTINCT x.portfolio_client_id)::int FROM public.opportunity_outcomes x
      WHERE x.org_id = _org_id AND x.stage = 'closed' AND x.occurred_at >= _since),
    (SELECT COALESCE(sum(x.value_cents),0)::bigint FROM public.opportunity_outcomes x
      WHERE x.org_id = _org_id AND x.stage = 'closed' AND x.occurred_at >= _since);
END;
$$;