-- 1. Outreach channel permissions -------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_channel_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  homeowner_id uuid,
  email_allowed boolean NOT NULL DEFAULT false,
  sms_allowed boolean NOT NULL DEFAULT false,
  phone_allowed boolean NOT NULL DEFAULT false,
  automated_contact_allowed boolean NOT NULL DEFAULT false,
  do_not_call boolean NOT NULL DEFAULT false,
  do_not_text boolean NOT NULL DEFAULT false,
  do_not_email boolean NOT NULL DEFAULT false,
  consent_source text NOT NULL DEFAULT 'unknown',
  consent_basis text NOT NULL DEFAULT 'unknown',
  consent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_channel_permissions TO authenticated;
GRANT ALL ON public.outreach_channel_permissions TO service_role;

ALTER TABLE public.outreach_channel_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage outreach permissions in their book"
  ON public.outreach_channel_permissions FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.lender_portfolio_clients c
      JOIN public.lender_portfolios p ON p.id = c.portfolio_id
      WHERE c.id = outreach_channel_permissions.portfolio_client_id
        AND public.is_lender_member(auth.uid(), p.lender_org_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.lender_portfolio_clients c
      JOIN public.lender_portfolios p ON p.id = c.portfolio_id
      WHERE c.id = outreach_channel_permissions.portfolio_client_id
        AND public.is_lender_member(auth.uid(), p.lender_org_id)
    )
  );

CREATE TRIGGER trg_outreach_channel_permissions_updated
  BEFORE UPDATE ON public.outreach_channel_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_ocp_org ON public.outreach_channel_permissions(org_id);

-- 2. Separate permission concepts on the book record -------------------------
ALTER TABLE public.lender_portfolio_clients
  ADD COLUMN IF NOT EXISTS contact_marketing_permission text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS intelligence_access_scope text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.lender_portfolio_clients.contact_marketing_permission IS
  'Communication/marketing permission for this relationship. Separate from relationship_basis and from SuCasa intelligence access.';
COMMENT ON COLUMN public.lender_portfolio_clients.intelligence_access_scope IS
  'Documented categories of SuCasa-generated intelligence permitted for this relationship. Empty means baseline only.';

-- 3. Traceable opportunity provenance ----------------------------------------
ALTER TABLE public.homeowner_opportunities
  ADD COLUMN IF NOT EXISTS reason_codes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_fields text[] NOT NULL DEFAULT '{}'::text[];

-- 4. AI language compliance log ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.compliance_language_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  user_id uuid,
  surface text NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  violations text[] NOT NULL DEFAULT '{}'::text[],
  excerpt text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.compliance_language_violations TO authenticated;
GRANT ALL ON public.compliance_language_violations TO service_role;

ALTER TABLE public.compliance_language_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read language violations"
  ON public.compliance_language_violations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_compliance_language_violations_updated
  BEFORE UPDATE ON public.compliance_language_violations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Program settings ---------------------------------------------------------
INSERT INTO public.platform_config (key, value_int, description)
VALUES ('respa_documentation_retention_years', 5,
        'Minimum retention baseline in years for sponsorship methodology, entitlement rules, consent/audit records, service-delivery evidence and pricing methodology.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.compliance_feature_flags (feature_key, category, compliance_review_required, status, notes)
VALUES ('fcra_consumer_report_data', 'fcra', true, 'blocked',
        'Any data source constituting consumer-report/credit-bureau information requires compliance review before it may be used for lender ranking, outreach or decisioning.')
ON CONFLICT (feature_key) DO NOTHING;