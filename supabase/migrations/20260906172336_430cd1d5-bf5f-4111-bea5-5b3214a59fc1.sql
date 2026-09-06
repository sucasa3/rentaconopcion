-- ---------------------------------------------------------------------------
-- 1. Platform configuration (limits/entitlements changeable without code)
-- ---------------------------------------------------------------------------
CREATE TABLE public.platform_config (
  key text PRIMARY KEY,
  value_int integer,
  value_text text,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_config TO authenticated;
GRANT ALL ON public.platform_config TO service_role;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read config" ON public.platform_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage config" ON public.platform_config
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_platform_config_updated BEFORE UPDATE ON public.platform_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_config (key, value_int, value_text, description) VALUES
  ('agent_base_profile_limit', 100, NULL, 'Home Profiles SuCasa provides to every agent organization, independent of any lender'),
  ('premium_price_cents', 1900, NULL, 'Homeowner self-purchase price for Premium Home Intelligence'),
  ('disclosure_version', NULL, '2026-09-v1', 'Current sponsor/consent disclosure text version'),
  ('capacity_warning_pct', 80, NULL, 'Percent of capacity at which we warn before the hard limit');

-- ---------------------------------------------------------------------------
-- 2. Agent base entitlement — provided by SuCasa only
-- ---------------------------------------------------------------------------
CREATE TABLE public.agent_base_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  profile_limit integer NOT NULL DEFAULT 100,
  source text NOT NULL DEFAULT 'sucasa' CHECK (source = 'sucasa'),
  reason text NOT NULL DEFAULT 'SuCasa agent product entitlement',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.agent_base_entitlements IS
  'Agent Home Profile entitlement provided directly by SuCasa. Source is locked to sucasa: no lender payment, plan, sponsorship or mortgage event may ever create or increase a row here.';
GRANT SELECT ON public.agent_base_entitlements TO authenticated;
GRANT ALL ON public.agent_base_entitlements TO service_role;
ALTER TABLE public.agent_base_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their own entitlement" ON public.agent_base_entitlements
  FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_agent_base_entitlements_updated BEFORE UPDATE ON public.agent_base_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.agent_base_entitlements (org_id, profile_limit)
SELECT id, 100 FROM public.lender_orgs WHERE org_type = 'agent'
ON CONFLICT (org_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Premium sponsorship (lender -> named homeowner)
-- ---------------------------------------------------------------------------
CREATE TABLE public.premium_sponsorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  portfolio_client_id uuid REFERENCES public.lender_portfolio_clients(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid,
  disclosure_version text NOT NULL DEFAULT '2026-09-v1',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.premium_sponsorships IS
  'A lender funding Premium Home Intelligence for one designated homeowner. Never created from legacy lender-to-agent allocations and never grants an agent any capacity or benefit.';
CREATE UNIQUE INDEX premium_sponsorships_active_uq
  ON public.premium_sponsorships (lender_org_id, homeowner_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE ON public.premium_sponsorships TO authenticated;
GRANT ALL ON public.premium_sponsorships TO service_role;
ALTER TABLE public.premium_sponsorships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sponsor members and the homeowner read sponsorships" ON public.premium_sponsorships
  FOR SELECT TO authenticated
  USING (homeowner_id = auth.uid()
     OR public.is_lender_member(auth.uid(), lender_org_id)
     OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sponsor managers create sponsorships" ON public.premium_sponsorships
  FOR INSERT TO authenticated
  WITH CHECK (public.is_lender_manager(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Sponsor managers and homeowner update sponsorships" ON public.premium_sponsorships
  FOR UPDATE TO authenticated
  USING (homeowner_id = auth.uid()
     OR public.is_lender_manager(auth.uid(), lender_org_id)
     OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_premium_sponsorships_updated BEFORE UPDATE ON public.premium_sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Premium Home Intelligence Membership
-- ---------------------------------------------------------------------------
CREATE TABLE public.premium_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'premium',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  funding_source text NOT NULL CHECK (funding_source IN ('homeowner_paid','sucasa_grant','sponsor_paid')),
  sponsorship_id uuid REFERENCES public.premium_sponsorships(id) ON DELETE SET NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  price_cents integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  canceled_at timestamptz,
  disclosure_version text NOT NULL DEFAULT '2026-09-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.premium_memberships IS
  'Premium Home Intelligence Membership held by the homeowner. Funding source is independent: homeowner-paid, SuCasa-granted or sponsor-paid.';
CREATE UNIQUE INDEX premium_memberships_active_uq
  ON public.premium_memberships (homeowner_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE ON public.premium_memberships TO authenticated;
GRANT ALL ON public.premium_memberships TO service_role;
ALTER TABLE public.premium_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners read their membership" ON public.premium_memberships
  FOR SELECT TO authenticated
  USING (homeowner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Homeowners update their membership" ON public.premium_memberships
  FOR UPDATE TO authenticated
  USING (homeowner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (homeowner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_premium_memberships_updated BEFORE UPDATE ON public.premium_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. Consent records — four separate, non-interchangeable permissions
-- ---------------------------------------------------------------------------
CREATE TABLE public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_org_id uuid REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  recipient_kind text NOT NULL DEFAULT 'lender' CHECK (recipient_kind IN ('lender','agent','vendor')),
  consent_type text NOT NULL CHECK (consent_type IN (
    'existing_relationship','marketing_communication','intelligence_access','connection_request')),
  scope text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'granted' CHECK (status IN ('granted','revoked')),
  source text NOT NULL DEFAULT 'homeowner_action',
  disclosure_version text NOT NULL DEFAULT '2026-09-v1',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.consent_records IS
  'Each permission is tracked separately and is never interchangeable: an existing customer relationship does not imply marketing permission, permission to see SuCasa intelligence, or a request to connect.';
CREATE INDEX consent_records_homeowner_idx ON public.consent_records (homeowner_id, consent_type, status);
GRANT SELECT, INSERT, UPDATE ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowner and recipient read consent" ON public.consent_records
  FOR SELECT TO authenticated
  USING (homeowner_id = auth.uid()
     OR (recipient_org_id IS NOT NULL AND public.is_lender_member(auth.uid(), recipient_org_id))
     OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Homeowners record their own consent" ON public.consent_records
  FOR INSERT TO authenticated
  WITH CHECK (homeowner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Homeowners revoke their own consent" ON public.consent_records
  FOR UPDATE TO authenticated
  USING (homeowner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (homeowner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_consent_records_updated BEFORE UPDATE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. Compliance audit log + feature review register
-- ---------------------------------------------------------------------------
CREATE TABLE public.compliance_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  org_id uuid,
  homeowner_id uuid,
  entity_type text,
  entity_id uuid,
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.compliance_audit_events TO authenticated;
GRANT ALL ON public.compliance_audit_events TO service_role;
ALTER TABLE public.compliance_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read the compliance log" ON public.compliance_audit_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.compliance_feature_flags (
  feature_key text PRIMARY KEY,
  category text NOT NULL,
  compliance_review_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending_review',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.compliance_feature_flags TO authenticated;
GRANT ALL ON public.compliance_feature_flags TO service_role;
ALTER TABLE public.compliance_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage feature review flags" ON public.compliance_feature_flags
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_compliance_feature_flags_updated BEFORE UPDATE ON public.compliance_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.compliance_feature_flags (feature_key, category, notes) VALUES
  ('lender_funded_agent_benefit', 'entitlement', 'Any feature where a lender payment could reach an agent benefit'),
  ('lead_routing', 'referral', 'Automated routing of homeowners to a settlement service provider'),
  ('provider_ranking', 'referral', 'Ranking or preferencing of lenders, title, inspection or insurance providers'),
  ('referral_incentive', 'referral', 'Any reward tied to a transaction, closing or referral'),
  ('automatic_data_sharing', 'privacy', 'Sharing homeowner intelligence without an explicit homeowner action');

-- ---------------------------------------------------------------------------
-- 7. Service delivery log (what the lender subscription actually delivered)
-- ---------------------------------------------------------------------------
CREATE TABLE public.service_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  homeowner_id uuid,
  portfolio_client_id uuid,
  quantity integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_delivery_events_org_idx ON public.service_delivery_events (org_id, occurred_at DESC);
GRANT SELECT ON public.service_delivery_events TO authenticated;
GRANT ALL ON public.service_delivery_events TO service_role;
ALTER TABLE public.service_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read their delivery log" ON public.service_delivery_events
  FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 8. Relationship basis on existing lender/agent homeowner records
-- ---------------------------------------------------------------------------
ALTER TABLE public.lender_portfolio_clients
  ADD COLUMN IF NOT EXISTS relationship_basis text NOT NULL DEFAULT 'org_uploaded';
COMMENT ON COLUMN public.lender_portfolio_clients.relationship_basis IS
  'How this contact entered the organization''s book (org_uploaded, homeowner_request, agent_added). Never on its own a permission to access SuCasa intelligence.';

-- Legacy lender-to-agent allocations are retained untouched for audit only.
COMMENT ON TABLE public.sponsored_agent_seats IS
  'LEGACY / AUDIT ONLY. Historical lender-to-agent allocations. Must not grant agent capacity or be converted into a Premium sponsorship.';
