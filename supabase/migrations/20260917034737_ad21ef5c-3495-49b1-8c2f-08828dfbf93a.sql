-- 1. Discovery run -----------------------------------------------------------
CREATE TABLE public.lender_discoveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES public.lender_portfolios(id) ON DELETE SET NULL,
  created_by uuid,
  status text NOT NULL DEFAULT 'awaiting_upload',
  allowance integer NOT NULL DEFAULT 100,
  submitted_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  over_allowance_rows integer NOT NULL DEFAULT 0,
  unique_properties integer NOT NULL DEFAULT 0,
  properties_matched integer NOT NULL DEFAULT 0,
  properties_unresolved integer NOT NULL DEFAULT 0,
  opportunity_clients integer NOT NULL DEFAULT 0,
  revealed_count integer NOT NULL DEFAULT 0,
  provider_calls integer NOT NULL DEFAULT 0,
  provider_cost_ten_thousandths integer NOT NULL DEFAULT 0,
  property_set_hash text,
  risk_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lender_discoveries_one_per_org ON public.lender_discoveries(org_id);
CREATE INDEX lender_discoveries_hash_idx ON public.lender_discoveries(property_set_hash);

GRANT SELECT ON public.lender_discoveries TO authenticated;
GRANT ALL ON public.lender_discoveries TO service_role;
ALTER TABLE public.lender_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read their own discovery"
  ON public.lender_discoveries FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_lender_discoveries_updated
  BEFORE UPDATE ON public.lender_discoveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Discovery snapshot rows (references only, no duplicated facts) ----------
CREATE TABLE public.lender_discovery_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  discovery_id uuid NOT NULL REFERENCES public.lender_discoveries(id) ON DELETE CASCADE,
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.homeowner_opportunities(id) ON DELETE SET NULL,
  primary_category text NOT NULL,
  primary_group text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  rank integer NOT NULL DEFAULT 0,
  revealed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lender_discovery_results_client ON public.lender_discovery_results(discovery_id, portfolio_client_id);

GRANT SELECT ON public.lender_discovery_results TO authenticated;
GRANT ALL ON public.lender_discovery_results TO service_role;
ALTER TABLE public.lender_discovery_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read their own discovery results"
  ON public.lender_discovery_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lender_discoveries d
     WHERE d.id = discovery_id
       AND (public.is_lender_member(auth.uid(), d.org_id) OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE TRIGGER trg_lender_discovery_results_updated
  BEFORE UPDATE ON public.lender_discovery_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Discovery stage on the organization, alongside subscription_status ------
ALTER TABLE public.lender_orgs
  ADD COLUMN IF NOT EXISTS discovery_state text NOT NULL DEFAULT 'discovery_not_started';

-- 4. Pilot + growth plans ----------------------------------------------------
INSERT INTO public.plan_tiers
  (key, name, audience, price_cents, positioning, seat_limit, sponsored_allocation, sponsored_seats, profile_allowance, active, sort_order)
VALUES
  ('pilot_90', '90-Day SuCasa Pilot', 'lender', 44700,
   'Ninety days of continuous monitoring for up to 1,000 Home Profiles. Continues as MLO Growth at $149/month unless cancelled.',
   1, 3, 3, 1000, true, 5),
  ('mlo_growth', 'MLO Growth', 'lender', 14900,
   'For a loan officer monitoring a large past-client database.', 1, 3, 3, 1000, true, 20)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      price_cents = EXCLUDED.price_cents,
      positioning = EXCLUDED.positioning,
      profile_allowance = EXCLUDED.profile_allowance,
      active = true;

-- 5. Internal-only Discovery unit cost, in ten-thousandths of a dollar -------
INSERT INTO public.platform_config (key, value_int, description)
VALUES ('discovery_enrichment_cost_per_property', 155,
        'Internal Discovery enrichment cost assumption in ten-thousandths of a dollar (155 = $0.0155 per property). Never shown to a lender.')
ON CONFLICT (key) DO NOTHING;