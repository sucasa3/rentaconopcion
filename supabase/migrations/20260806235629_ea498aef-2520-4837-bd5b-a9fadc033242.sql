ALTER TABLE public.lender_portfolios
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lender_portfolios_assigned_user
  ON public.lender_portfolios (assigned_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_lender_portfolio_per_officer
  ON public.lender_portfolios (assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

ALTER TABLE public.lender_orgs
  ADD COLUMN IF NOT EXISTS seat_limit integer;