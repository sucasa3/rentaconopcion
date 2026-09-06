ALTER TABLE public.plan_tiers
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS profile_allowance integer;

ALTER TABLE public.lender_orgs
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS profile_allowance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS lender_orgs_stripe_customer_idx
  ON public.lender_orgs (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lender_orgs_stripe_subscription_idx
  ON public.lender_orgs (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;