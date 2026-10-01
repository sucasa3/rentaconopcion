
-- Property identity for agent imports: normalized full address incl. unit + ZIP5.
ALTER TABLE public.lender_portfolio_clients ADD COLUMN IF NOT EXISTS address_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_portfolio_client_address_key
  ON public.lender_portfolio_clients (portfolio_id, address_key)
  WHERE address_key IS NOT NULL AND archived_at IS NULL;

-- Verified agent identity (minimum abuse-prevention identifiers only).
CREATE TABLE public.agent_identity (
  user_id uuid PRIMARY KEY,
  phone_hash text,
  phone_last4 text,
  phone_verified_at timestamptz,
  license_number text,
  license_state text,
  license_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_identity TO authenticated;
GRANT ALL ON public.agent_identity TO service_role;
ALTER TABLE public.agent_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own identity" ON public.agent_identity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX agent_identity_phone_idx ON public.agent_identity (phone_hash);
CREATE INDEX agent_identity_license_idx ON public.agent_identity (license_key);

-- One promotion per verified phone, per person and per organization. Never deleted with the account.
CREATE TABLE public.agent_promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_key text NOT NULL DEFAULT 'agent_free_100',
  phone_hash text NOT NULL,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  profile_grant integer NOT NULL DEFAULT 100,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_promo_phone_uniq UNIQUE (promo_key, phone_hash),
  CONSTRAINT agent_promo_user_uniq UNIQUE (promo_key, user_id),
  CONSTRAINT agent_promo_org_uniq UNIQUE (promo_key, org_id)
);
GRANT ALL ON public.agent_promo_redemptions TO service_role;
ALTER TABLE public.agent_promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read redemptions" ON public.agent_promo_redemptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.agent_promo_redemptions TO authenticated;

-- Admin review queue for suspected duplicate identities.
CREATE TABLE public.agent_identity_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  user_id uuid NOT NULL,
  org_id uuid,
  related_user_id uuid,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  decision text,
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_identity_reviews_status_chk CHECK (status IN ('open','approved','denied','dismissed'))
);
GRANT SELECT ON public.agent_identity_reviews TO authenticated;
GRANT ALL ON public.agent_identity_reviews TO service_role;
ALTER TABLE public.agent_identity_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read identity reviews" ON public.agent_identity_reviews FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX agent_identity_reviews_open_uniq ON public.agent_identity_reviews (kind, user_id) WHERE status = 'open';

-- One Discovery job per agent book; rows above the allowance wait here (not enriched).
CREATE TABLE public.agent_discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.lender_portfolios(id) ON DELETE CASCADE,
  created_by uuid,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  pending_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  needs_address jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_discovery_runs_portfolio_uniq UNIQUE (portfolio_id)
);
GRANT SELECT ON public.agent_discovery_runs TO authenticated;
GRANT ALL ON public.agent_discovery_runs TO service_role;
ALTER TABLE public.agent_discovery_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read discovery runs" ON public.agent_discovery_runs FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_agent_discovery_runs_updated BEFORE UPDATE ON public.agent_discovery_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic promotion redemption. Unique constraints make concurrent attempts issue one grant.
CREATE OR REPLACE FUNCTION public.redeem_agent_promotion(_user_id uuid, _org_id uuid, _phone_hash text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_grant integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.agent_promo_redemptions WHERE org_id = _org_id) THEN
    RETURN 'org_used';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_base_entitlements WHERE org_id = _org_id)
     OR EXISTS (SELECT 1 FROM public.agent_credit_ledger WHERE org_id = _org_id AND kind = 'base') THEN
    RETURN 'already_entitled';
  END IF;

  SELECT COALESCE(value_int, 100) INTO v_grant FROM public.platform_config WHERE key = 'agent_base_profile_limit';
  v_grant := COALESCE(v_grant, 100);

  INSERT INTO public.agent_promo_redemptions (phone_hash, user_id, org_id, profile_grant)
  VALUES (_phone_hash, _user_id, _org_id, v_grant)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.agent_promo_redemptions WHERE phone_hash = _phone_hash) THEN
      RETURN 'phone_used';
    ELSIF EXISTS (SELECT 1 FROM public.agent_promo_redemptions WHERE user_id = _user_id) THEN
      RETURN 'user_used';
    END IF;
    RETURN 'org_used';
  END IF;

  INSERT INTO public.agent_base_entitlements (org_id, profile_limit, source)
  VALUES (_org_id, v_grant, 'sucasa') ON CONFLICT (org_id) DO NOTHING;
  INSERT INTO public.agent_credit_ledger (org_id, kind, delta, reason, event_key)
  VALUES (_org_id, 'base', v_grant, 'SuCasa agent base entitlement', 'promo:' || _org_id)
  ON CONFLICT (event_key) DO NOTHING;
  RETURN 'granted';
END; $$;
REVOKE ALL ON FUNCTION public.redeem_agent_promotion(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_agent_promotion(uuid, uuid, text) TO service_role;

-- Paid plan capacity as ledger adjustments; a given from->to step is recorded once.
CREATE OR REPLACE FUNCTION public.set_agent_plan_capacity(_org_id uuid, _target integer, _ref text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_delta integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agent_plan_capacity:' || _org_id));
  SELECT COALESCE(sum(delta), 0)::int INTO v_current
    FROM public.agent_credit_ledger WHERE org_id = _org_id AND kind = 'purchased' AND reason = 'Plan capacity';
  v_delta := GREATEST(_target, 0) - v_current;
  IF v_delta = 0 THEN RETURN 0; END IF;
  INSERT INTO public.agent_credit_ledger (org_id, kind, delta, reason, event_key)
  VALUES (_org_id, 'purchased', v_delta, 'Plan capacity',
          'plancap:' || _org_id || ':' || v_current || '->' || GREATEST(_target, 0) || ':' || COALESCE(_ref, ''))
  ON CONFLICT (event_key) DO NOTHING;
  RETURN v_delta;
END; $$;
REVOKE ALL ON FUNCTION public.set_agent_plan_capacity(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_agent_plan_capacity(uuid, integer, text) TO service_role;
