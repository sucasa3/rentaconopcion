
-- =========================================================================
-- 1. property_intel: cached ATTOM data keyed by normalized address
-- =========================================================================
CREATE TABLE public.property_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_normalized text NOT NULL UNIQUE,
  address_line1 text NOT NULL,
  city text,
  state text,
  zip text,
  attom_id text,

  -- Per-data-class JSON blobs (raw ATTOM response subsets, trimmed)
  avm jsonb,
  detail jsonb,
  tax jsonb,
  sales jsonb,
  permits jsonb,
  neighborhood jsonb,
  risk jsonb,
  owner jsonb,
  mortgage jsonb,

  -- Per-data-class freshness (drives TTL-based refresh decisions)
  avm_fetched_at timestamptz,
  detail_fetched_at timestamptz,
  tax_fetched_at timestamptz,
  sales_fetched_at timestamptz,
  permits_fetched_at timestamptz,
  neighborhood_fetched_at timestamptz,
  risk_fetched_at timestamptz,
  owner_fetched_at timestamptz,
  mortgage_fetched_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_intel_addr ON public.property_intel(address_normalized);
CREATE INDEX idx_property_intel_zip ON public.property_intel(zip);

GRANT SELECT ON public.property_intel TO authenticated;
GRANT ALL ON public.property_intel TO service_role;

ALTER TABLE public.property_intel ENABLE ROW LEVEL SECURITY;

-- Homeowners see intel for their own address only (match normalized address on profile)
CREATE POLICY "Homeowners view intel for their own address"
  ON public.property_intel FOR SELECT
  TO authenticated
  USING (
    address_normalized IN (
      SELECT lower(regexp_replace(coalesce(address,''), '\s+', ' ', 'g'))
      FROM public.profiles WHERE id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER trg_property_intel_updated_at
  BEFORE UPDATE ON public.property_intel
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 2. attom_call_log: every ATTOM API call, for spend + revenue attribution
-- =========================================================================
CREATE TABLE public.attom_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,                   -- 'avm', 'detail', 'tax', 'sales', 'permits', ...
  address_normalized text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cache_hit boolean NOT NULL DEFAULT false,
  cost_cents integer NOT NULL DEFAULT 0,    -- 10 = $0.10 (trial tier rate)
  status integer,                            -- HTTP status from ATTOM
  error_message text,
  revenue_source text,                       -- 'signup_enrichment' | 'refresh' | 'report' | 'lead_claim' | ...
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attom_log_created ON public.attom_call_log(created_at DESC);
CREATE INDEX idx_attom_log_endpoint ON public.attom_call_log(endpoint);
CREATE INDEX idx_attom_log_user ON public.attom_call_log(requested_by);

GRANT SELECT ON public.attom_call_log TO authenticated;
GRANT ALL ON public.attom_call_log TO service_role;

ALTER TABLE public.attom_call_log ENABLE ROW LEVEL SECURITY;

-- Only admins read call logs
CREATE POLICY "Admins view all call logs"
  ON public.attom_call_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- 3. attom_monthly_budget: rolling per-month spend + tier caps
-- =========================================================================
CREATE TABLE public.attom_monthly_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE,                -- first day of month
  tier_calls_included integer NOT NULL DEFAULT 5000,   -- $500 trial tier
  tier_cost_cents integer NOT NULL DEFAULT 50000,      -- $500
  soft_cap_pct integer NOT NULL DEFAULT 80,            -- switch to cache-only at 80%
  calls_used integer NOT NULL DEFAULT 0,
  cost_cents_used integer NOT NULL DEFAULT 0,
  cache_only_mode boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.attom_monthly_budget TO authenticated;
GRANT ALL ON public.attom_monthly_budget TO service_role;

ALTER TABLE public.attom_monthly_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view budget"
  ON public.attom_monthly_budget FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_attom_budget_updated_at
  BEFORE UPDATE ON public.attom_monthly_budget
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the current month at the trial tier so the budgeter has a row to read
INSERT INTO public.attom_monthly_budget (month, tier_calls_included, tier_cost_cents)
VALUES (date_trunc('month', now())::date, 5000, 50000)
ON CONFLICT (month) DO NOTHING;
