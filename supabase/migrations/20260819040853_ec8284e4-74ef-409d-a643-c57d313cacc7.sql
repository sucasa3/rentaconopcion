-- ===========================================================================
-- Homeowner credits: the distribution engine
-- ===========================================================================

CREATE TABLE public.agent_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('base','sponsor','earned','purchased','spend','refund')),
  delta integer NOT NULL,
  reason text NOT NULL,
  portfolio_client_id uuid REFERENCES public.lender_portfolio_clients(id) ON DELETE SET NULL,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_credit_ledger_event_key_idx ON public.agent_credit_ledger (event_key);
CREATE INDEX agent_credit_ledger_org_idx ON public.agent_credit_ledger (org_id, created_at DESC);

GRANT SELECT ON public.agent_credit_ledger TO authenticated;
GRANT ALL ON public.agent_credit_ledger TO service_role;
ALTER TABLE public.agent_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read their credit ledger"
  ON public.agent_credit_ledger FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

-- Agent plan state (model + enforce; no billing yet) ------------------------
CREATE TABLE public.agent_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  plan_key text NOT NULL DEFAULT 'agent_core',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','requested','cancelled')),
  requested_plan_key text,
  requested_at timestamptz,
  requested_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_plans TO authenticated;
GRANT ALL ON public.agent_plans TO service_role;
ALTER TABLE public.agent_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read their plan"
  ON public.agent_plans FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_agent_plans_updated BEFORE UPDATE ON public.agent_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lender-sponsored agent seats ---------------------------------------------
CREATE TABLE public.sponsored_agent_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  agent_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  credits_granted integer NOT NULL DEFAULT 25,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sponsored_agent_seats_active_idx
  ON public.sponsored_agent_seats (sponsor_org_id, agent_org_id) WHERE status = 'active';

GRANT SELECT ON public.sponsored_agent_seats TO authenticated;
GRANT ALL ON public.sponsored_agent_seats TO service_role;
ALTER TABLE public.sponsored_agent_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Both sides read their seats"
  ON public.sponsored_agent_seats FOR SELECT TO authenticated
  USING (
    public.is_lender_member(auth.uid(), sponsor_org_id)
    OR public.is_lender_member(auth.uid(), agent_org_id)
    OR public.has_role(auth.uid(), 'admin')
  );

-- Plan tiers gain a seat allocation and the two agent capacity tiers --------
ALTER TABLE public.plan_tiers ADD COLUMN IF NOT EXISTS sponsored_seats integer;
ALTER TABLE public.plan_tiers ADD COLUMN IF NOT EXISTS credits_included integer;

UPDATE public.plan_tiers SET sponsored_seats = CASE key
  WHEN 'mlo_essentials' THEN 5
  WHEN 'mlo_growth' THEN 15
  WHEN 'branch_growth' THEN 60
  WHEN 'branch_pro' THEN 150
  ELSE sponsored_seats END
WHERE audience = 'lender';

UPDATE public.plan_tiers SET credits_included = 25 WHERE key = 'agent_core';

INSERT INTO public.plan_tiers (key, name, audience, price_cents, seat_limit, sponsored_allocation, credits_included, positioning, sort_order, active)
VALUES
  ('agent_plus', 'Agent Plus', 'agent', 2000, NULL, 0, 100, 'Unlock 100 more homeowners, premium reports and the SuCasa referral network.', 7, true),
  ('agent_pro',  'Agent Pro',  'agent', 3900, NULL, 0, 250, 'Unlock 250 more homeowners, advanced opportunity intelligence and priority referrals.', 8, true)
ON CONFLICT (key) DO NOTHING;

-- Balance ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.agent_credit_remaining(_org_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(delta), 0)::int FROM public.agent_credit_ledger WHERE org_id = _org_id;
$$;
REVOKE EXECUTE ON FUNCTION private.agent_credit_remaining(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_credit_summary(_org_id uuid)
RETURNS TABLE(granted integer, earned integer, purchased integer, spent integer, remaining integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_lender_member(auth.uid(), _org_id)
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(sum(delta) FILTER (WHERE kind IN ('base','sponsor')), 0)::int,
    COALESCE(sum(delta) FILTER (WHERE kind = 'earned'), 0)::int,
    COALESCE(sum(delta) FILTER (WHERE kind = 'purchased'), 0)::int,
    COALESCE(-sum(delta) FILTER (WHERE kind IN ('spend','refund')), 0)::int,
    COALESCE(sum(delta), 0)::int
  FROM public.agent_credit_ledger WHERE org_id = _org_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.agent_credit_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_credit_summary(uuid) TO authenticated, service_role;

-- Spend enforcement at the data layer --------------------------------------
CREATE OR REPLACE FUNCTION public.tg_spend_homeowner_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid;
  v_org_type text;
  v_remaining integer;
BEGIN
  SELECT o.id, o.org_type INTO v_org_id, v_org_type
    FROM public.lender_portfolios p
    JOIN public.lender_orgs o ON o.id = p.lender_org_id
   WHERE p.id = NEW.portfolio_id;

  IF v_org_id IS NULL OR v_org_type <> 'agent' THEN
    RETURN NEW;
  END IF;

  v_remaining := private.agent_credit_remaining(v_org_id);
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'No homeowner credits remaining. Earn more or unlock additional homeowner connections.';
  END IF;

  INSERT INTO public.agent_credit_ledger (org_id, kind, delta, reason, portfolio_client_id, event_key)
  VALUES (v_org_id, 'spend', -1, 'Homeowner added to your book', NEW.id, 'spend:' || NEW.id)
  ON CONFLICT (event_key) DO NOTHING;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_spend_homeowner_credit
  AFTER INSERT ON public.lender_portfolio_clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_spend_homeowner_credit();

-- Award helper -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_agent_credit(
  _org_id uuid, _client_id uuid, _event_key text, _delta integer, _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _org_id IS NULL OR _delta <= 0 THEN RETURN; END IF;
  INSERT INTO public.agent_credit_ledger (org_id, kind, delta, reason, portfolio_client_id, event_key)
  VALUES (_org_id, 'earned', _delta, _reason, _client_id, _event_key)
  ON CONFLICT (event_key) DO NOTHING;
END; $$;
REVOKE EXECUTE ON FUNCTION public.award_agent_credit(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_agent_credit(uuid, uuid, text, integer, text) TO service_role;

-- Activation and profile-completion awards fire from the database ----------
CREATE OR REPLACE FUNCTION public.tg_award_client_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id uuid;
BEGIN
  IF NEW.homeowner_id IS NULL OR NEW.homeowner_id IS NOT DISTINCT FROM OLD.homeowner_id THEN
    RETURN NEW;
  END IF;
  SELECT o.id INTO v_org_id
    FROM public.lender_portfolios p JOIN public.lender_orgs o ON o.id = p.lender_org_id
   WHERE p.id = NEW.portfolio_id AND o.org_type = 'agent';
  PERFORM public.award_agent_credit(v_org_id, NEW.id, 'activate:' || NEW.id, 1,
    'Homeowner activated their account');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_award_client_activation
  AFTER UPDATE ON public.lender_portfolio_clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_award_client_activation();

CREATE OR REPLACE FUNCTION public.tg_award_profile_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.address IS NULL OR NEW.city IS NULL OR COALESCE(NEW.full_name,'') = '' THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT c.id AS client_id, o.id AS org_id
      FROM public.lender_portfolio_clients c
      JOIN public.lender_portfolios p ON p.id = c.portfolio_id
      JOIN public.lender_orgs o ON o.id = p.lender_org_id AND o.org_type = 'agent'
     WHERE c.homeowner_id = NEW.id
  LOOP
    PERFORM public.award_agent_credit(r.org_id, r.client_id, 'profile:' || r.client_id, 1,
      'Home Profile completed');
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_award_profile_completion
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_award_profile_completion();

-- Backfill: every existing agent org keeps its book and its 25 base credits.
INSERT INTO public.agent_credit_ledger (org_id, kind, delta, reason, event_key)
SELECT o.id, 'base', 25, 'Starting homeowner credits', 'base:' || o.id
FROM public.lender_orgs o WHERE o.org_type = 'agent'
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.agent_credit_ledger (org_id, kind, delta, reason, event_key)
SELECT o.id, 'earned', count(c.id)::int, 'Grandfathered existing homeowners', 'grandfather:' || o.id
FROM public.lender_orgs o
JOIN public.lender_portfolios p ON p.lender_org_id = o.id
JOIN public.lender_portfolio_clients c ON c.portfolio_id = p.id
WHERE o.org_type = 'agent'
GROUP BY o.id
HAVING count(c.id) > 0
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.agent_credit_ledger (org_id, kind, delta, reason, portfolio_client_id, event_key)
SELECT o.id, 'spend', -1, 'Homeowner added to your book', c.id, 'spend:' || c.id
FROM public.lender_orgs o
JOIN public.lender_portfolios p ON p.lender_org_id = o.id
JOIN public.lender_portfolio_clients c ON c.portfolio_id = p.id
WHERE o.org_type = 'agent'
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.agent_plans (org_id, plan_key, status)
SELECT o.id, 'agent_core', 'active' FROM public.lender_orgs o WHERE o.org_type = 'agent'
ON CONFLICT (org_id) DO NOTHING;