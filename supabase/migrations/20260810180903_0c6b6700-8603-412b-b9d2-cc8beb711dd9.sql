-- ---------------------------------------------------------------------------
-- Helper: resolve the owning org of a portfolio client (security definer so
-- RLS policies can traverse portfolio_client -> portfolio -> org).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.portfolio_client_org(_client_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.lender_org_id
  FROM public.lender_portfolio_clients c
  JOIN public.lender_portfolios p ON p.id = c.portfolio_id
  WHERE c.id = _client_id
$$;

-- ---------------------------------------------------------------------------
-- 1. Plan tiers (reference data). NULL allocation / seat_limit = unlimited.
-- ---------------------------------------------------------------------------
CREATE TABLE public.plan_tiers (
  key text PRIMARY KEY,
  name text NOT NULL,
  audience text NOT NULL,
  price_cents integer,
  seat_limit integer,
  sponsored_allocation integer,
  positioning text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plan_tiers TO authenticated;
GRANT ALL ON public.plan_tiers TO service_role;
ALTER TABLE public.plan_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_tiers_read" ON public.plan_tiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "plan_tiers_admin_manage" ON public.plan_tiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_plan_tiers_updated BEFORE UPDATE ON public.plan_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.plan_tiers (key, name, audience, price_cents, seat_limit, sponsored_allocation, positioning, sort_order) VALUES
  ('mlo_essentials', 'MLO Essentials', 'lender',   19700,  1,    0, 'Individual MLO; core homeowner intelligence, alerts, basic opportunity functionality.', 1),
  ('mlo_growth',     'MLO Growth',     'lender',   39700,  1,  250, 'Hero plan; agent network, opportunity engine, sponsored profiles, campaigns, alerts, prospecting, tracking.', 2),
  ('branch_growth',  'Branch Growth',  'lender',  149700,  5, 2500, 'Up to 5 MLOs; shared branch agent and homeowner opportunity network.', 3),
  ('branch_pro',     'Branch Pro',     'lender',  249700, 15, 7500, 'Up to 15 MLOs; larger agent and profile capacity, advanced analytics and network tools.', 4),
  ('enterprise',     'Enterprise',     'lender',    NULL, NULL, NULL, 'Regional and national lenders; large portfolios, custom integrations and branding, multi-branch intelligence.', 5),
  ('agent_core',     'Agent Core',     'agent',        0, NULL,    0, 'Free for agents; homeowner intelligence for their own book plus lender partner connections.', 6);

-- ---------------------------------------------------------------------------
-- 2. Org plan + sponsorship capacity (NULL allocation = unlimited)
-- ---------------------------------------------------------------------------
ALTER TABLE public.lender_orgs
  ADD COLUMN IF NOT EXISTS plan_key text REFERENCES public.plan_tiers(key),
  ADD COLUMN IF NOT EXISTS sponsored_allocation integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Homeowner opportunities
-- ---------------------------------------------------------------------------
CREATE TABLE public.homeowner_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('equity','heloc','refinance_review','move_up','investment','mortgage_review')),
  strength text NOT NULL DEFAULT 'emerging' CHECK (strength IN ('strong','moderate','emerging')),
  score integer NOT NULL DEFAULT 0,
  reasons text[] NOT NULL DEFAULT '{}',
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','introduced','declined','expired')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_client_id, category)
);

CREATE INDEX idx_homeowner_opportunities_org ON public.homeowner_opportunities(org_id, category, state);
CREATE INDEX idx_homeowner_opportunities_client ON public.homeowner_opportunities(portfolio_client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.homeowner_opportunities TO authenticated;
GRANT ALL ON public.homeowner_opportunities TO service_role;
ALTER TABLE public.homeowner_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunities_org_members_manage" ON public.homeowner_opportunities
  FOR ALL TO authenticated
  USING (private.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_homeowner_opportunities_updated BEFORE UPDATE ON public.homeowner_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Agent <-> lender connections
-- ---------------------------------------------------------------------------
CREATE TABLE public.agent_lender_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  agent_org_id uuid REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  invited_email text,
  invited_name text,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','connected','declined','disconnected')),
  invited_by uuid REFERENCES auth.users(id),
  responded_by uuid REFERENCES auth.users(id),
  responded_at timestamptz,
  disconnected_at timestamptz,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_alc_pair ON public.agent_lender_connections(lender_org_id, agent_org_id)
  WHERE agent_org_id IS NOT NULL;
CREATE INDEX idx_alc_agent ON public.agent_lender_connections(agent_org_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_lender_connections TO authenticated;
GRANT ALL ON public.agent_lender_connections TO service_role;
ALTER TABLE public.agent_lender_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alc_read_either_side" ON public.agent_lender_connections
  FOR SELECT TO authenticated
  USING (
    private.is_lender_member(auth.uid(), lender_org_id)
    OR (agent_org_id IS NOT NULL AND private.is_lender_member(auth.uid(), agent_org_id))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "alc_lender_invites" ON public.agent_lender_connections
  FOR INSERT TO authenticated
  WITH CHECK (private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "alc_either_side_updates" ON public.agent_lender_connections
  FOR UPDATE TO authenticated
  USING (
    private.is_lender_member(auth.uid(), lender_org_id)
    OR (agent_org_id IS NOT NULL AND private.is_lender_member(auth.uid(), agent_org_id))
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    private.is_lender_member(auth.uid(), lender_org_id)
    OR (agent_org_id IS NOT NULL AND private.is_lender_member(auth.uid(), agent_org_id))
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_alc_updated BEFORE UPDATE ON public.agent_lender_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. Introduction requests (lender asks; only the agent can approve)
-- ---------------------------------------------------------------------------
CREATE TABLE public.introduction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.agent_lender_connections(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.homeowner_opportunities(id) ON DELETE SET NULL,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  agent_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  category text,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  requested_by uuid REFERENCES auth.users(id),
  responded_by uuid REFERENCES auth.users(id),
  responded_at timestamptz,
  outcome text CHECK (outcome IS NULL OR outcome IN ('no_contact','contacted','in_conversation','application','funded','not_pursuing')),
  outcome_note text,
  outcome_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intro_agent_status ON public.introduction_requests(agent_org_id, status);
CREATE INDEX idx_intro_lender_status ON public.introduction_requests(lender_org_id, status);

GRANT SELECT, INSERT, UPDATE ON public.introduction_requests TO authenticated;
GRANT ALL ON public.introduction_requests TO service_role;
ALTER TABLE public.introduction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intro_read_either_side" ON public.introduction_requests
  FOR SELECT TO authenticated
  USING (
    private.is_lender_member(auth.uid(), lender_org_id)
    OR private.is_lender_member(auth.uid(), agent_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "intro_lender_requests" ON public.introduction_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    (private.is_lender_member(auth.uid(), lender_org_id) AND status = 'pending')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "intro_agent_responds" ON public.introduction_requests
  FOR UPDATE TO authenticated
  USING (
    private.is_lender_member(auth.uid(), agent_org_id)
    OR private.is_lender_member(auth.uid(), lender_org_id)
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    private.is_lender_member(auth.uid(), agent_org_id)
    OR private.is_lender_member(auth.uid(), lender_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_intro_updated BEFORE UPDATE ON public.introduction_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_guard_introduction_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.connection_id       := OLD.connection_id;
  NEW.portfolio_client_id := OLD.portfolio_client_id;
  NEW.lender_org_id       := OLD.lender_org_id;
  NEW.agent_org_id        := OLD.agent_org_id;
  NEW.requested_by        := OLD.requested_by;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('approved','declined') THEN
      IF NOT private.is_lender_member(auth.uid(), OLD.agent_org_id) THEN
        RAISE EXCEPTION 'Only the agent can approve or decline an introduction';
      END IF;
      NEW.responded_by := auth.uid();
      NEW.responded_at := now();
    ELSIF NEW.status = 'withdrawn' THEN
      IF NOT private.is_lender_member(auth.uid(), OLD.lender_org_id) THEN
        RAISE EXCEPTION 'Only the requesting lender can withdraw an introduction';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid introduction status transition';
    END IF;
  END IF;

  IF NEW.outcome IS DISTINCT FROM OLD.outcome AND NEW.outcome IS NOT NULL THEN
    NEW.outcome_at := now();
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_introduction_response BEFORE UPDATE ON public.introduction_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_introduction_response();

-- ---------------------------------------------------------------------------
-- 6. Reveal audit log
-- ---------------------------------------------------------------------------
CREATE TABLE public.introduction_reveals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  introduction_request_id uuid NOT NULL REFERENCES public.introduction_requests(id) ON DELETE CASCADE,
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  agent_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  viewed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reveals_request ON public.introduction_reveals(introduction_request_id);

GRANT SELECT, INSERT ON public.introduction_reveals TO authenticated;
GRANT ALL ON public.introduction_reveals TO service_role;
ALTER TABLE public.introduction_reveals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reveals_read_either_side" ON public.introduction_reveals
  FOR SELECT TO authenticated
  USING (
    private.is_lender_member(auth.uid(), lender_org_id)
    OR private.is_lender_member(auth.uid(), agent_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "reveals_lender_logs" ON public.introduction_reveals
  FOR INSERT TO authenticated
  WITH CHECK (
    viewed_by = auth.uid()
    AND private.is_lender_member(auth.uid(), lender_org_id)
    AND EXISTS (
      SELECT 1 FROM public.introduction_requests r
      WHERE r.id = introduction_reveals.introduction_request_id
        AND r.status = 'approved'
        AND r.lender_org_id = introduction_reveals.lender_org_id
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Sponsored premium profiles
-- ---------------------------------------------------------------------------
CREATE TABLE public.sponsored_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  agent_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  allocated_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','grace','ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  grace_until timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_sponsored_active_client ON public.sponsored_profiles(portfolio_client_id)
  WHERE status <> 'ended';
CREATE INDEX idx_sponsored_sponsor ON public.sponsored_profiles(sponsor_org_id, status);
CREATE INDEX idx_sponsored_homeowner ON public.sponsored_profiles(homeowner_id) WHERE homeowner_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.sponsored_profiles TO authenticated;
GRANT ALL ON public.sponsored_profiles TO service_role;
ALTER TABLE public.sponsored_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsored_read" ON public.sponsored_profiles
  FOR SELECT TO authenticated
  USING (
    homeowner_id = auth.uid()
    OR private.is_lender_member(auth.uid(), sponsor_org_id)
    OR private.is_lender_member(auth.uid(), agent_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sponsored_agent_allocates" ON public.sponsored_profiles
  FOR INSERT TO authenticated
  WITH CHECK (private.is_lender_member(auth.uid(), agent_org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sponsored_lifecycle_update" ON public.sponsored_profiles
  FOR UPDATE TO authenticated
  USING (
    private.is_lender_member(auth.uid(), agent_org_id)
    OR private.is_lender_member(auth.uid(), sponsor_org_id)
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    private.is_lender_member(auth.uid(), agent_org_id)
    OR private.is_lender_member(auth.uid(), sponsor_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_sponsored_updated BEFORE UPDATE ON public.sponsored_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_enforce_sponsor_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap integer;
  v_unlimited boolean;
  v_used integer;
BEGIN
  SELECT o.sponsored_allocation, (t.key IS NOT NULL AND t.sponsored_allocation IS NULL)
    INTO v_cap, v_unlimited
    FROM public.lender_orgs o
    LEFT JOIN public.plan_tiers t ON t.key = o.plan_key
   WHERE o.id = NEW.sponsor_org_id;

  IF COALESCE(v_unlimited, false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_used
    FROM public.sponsored_profiles
   WHERE sponsor_org_id = NEW.sponsor_org_id AND status <> 'ended';

  IF v_used >= COALESCE(v_cap, 0) THEN
    RAISE EXCEPTION 'Sponsored profile allocation exhausted (% of % used)', v_used, COALESCE(v_cap, 0);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_sponsor_allocation BEFORE INSERT ON public.sponsored_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_sponsor_allocation();

-- ---------------------------------------------------------------------------
-- 8. Agent-approved campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE public.campaign_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  agent_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.agent_lender_connections(id) ON DELETE CASCADE,
  opportunity_category text,
  proposed_client_ids uuid[] NOT NULL DEFAULT '{}',
  approved_client_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','partially_approved','declined','withdrawn')),
  proposed_by uuid REFERENCES auth.users(id),
  responded_by uuid REFERENCES auth.users(id),
  responded_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_approvals_agent ON public.campaign_approvals(agent_org_id, status);
CREATE INDEX idx_campaign_approvals_lender ON public.campaign_approvals(lender_org_id, status);

GRANT SELECT, INSERT, UPDATE ON public.campaign_approvals TO authenticated;
GRANT ALL ON public.campaign_approvals TO service_role;
ALTER TABLE public.campaign_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_approvals_read" ON public.campaign_approvals
  FOR SELECT TO authenticated
  USING (
    private.is_lender_member(auth.uid(), lender_org_id)
    OR private.is_lender_member(auth.uid(), agent_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "campaign_approvals_lender_proposes" ON public.campaign_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    (private.is_lender_member(auth.uid(), lender_org_id) AND status = 'pending')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "campaign_approvals_respond" ON public.campaign_approvals
  FOR UPDATE TO authenticated
  USING (
    private.is_lender_member(auth.uid(), agent_org_id)
    OR private.is_lender_member(auth.uid(), lender_org_id)
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    private.is_lender_member(auth.uid(), agent_org_id)
    OR private.is_lender_member(auth.uid(), lender_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_campaign_approvals_updated BEFORE UPDATE ON public.campaign_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_guard_campaign_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  NEW.campaign_id         := OLD.campaign_id;
  NEW.lender_org_id       := OLD.lender_org_id;
  NEW.agent_org_id        := OLD.agent_org_id;
  NEW.proposed_by         := OLD.proposed_by;
  NEW.proposed_client_ids := OLD.proposed_client_ids;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('approved','partially_approved','declined') THEN
      IF NOT private.is_lender_member(auth.uid(), OLD.agent_org_id) THEN
        RAISE EXCEPTION 'Only the agent can respond to a campaign audience';
      END IF;
      NEW.responded_by := auth.uid();
      NEW.responded_at := now();
    ELSIF NEW.status = 'withdrawn' THEN
      IF NOT private.is_lender_member(auth.uid(), OLD.lender_org_id) THEN
        RAISE EXCEPTION 'Only the proposing lender can withdraw a campaign';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid campaign approval status transition';
    END IF;
  END IF;

  IF NOT (NEW.approved_client_ids <@ OLD.proposed_client_ids) THEN
    RAISE EXCEPTION 'Approved audience must be a subset of the proposed audience';
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_campaign_approval BEFORE UPDATE ON public.campaign_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_campaign_approval();