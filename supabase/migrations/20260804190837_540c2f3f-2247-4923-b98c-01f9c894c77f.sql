CREATE TABLE public.property_listing_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'off_market',
  list_price_cents bigint,
  list_date date,
  expiry_date date,
  listed_with_other_agent boolean NOT NULL DEFAULT false,
  listing_agent_name text,
  source text NOT NULL DEFAULT 'manual',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_listing_status TO authenticated;
GRANT ALL ON public.property_listing_status TO service_role;

ALTER TABLE public.property_listing_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage listing status"
ON public.property_listing_status
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.lender_portfolio_clients c
    JOIN public.lender_portfolios p ON p.id = c.portfolio_id
    JOIN public.lender_members m ON m.lender_org_id = p.lender_org_id
    WHERE c.id = property_listing_status.portfolio_client_id
      AND m.user_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.lender_portfolio_clients c
    JOIN public.lender_portfolios p ON p.id = c.portfolio_id
    JOIN public.lender_members m ON m.lender_org_id = p.lender_org_id
    WHERE c.id = property_listing_status.portfolio_client_id
      AND m.user_id = auth.uid()
  )
);

CREATE TRIGGER trg_property_listing_status_updated
BEFORE UPDATE ON public.property_listing_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_listing_status_client ON public.property_listing_status(portfolio_client_id);
CREATE INDEX idx_listing_status_status ON public.property_listing_status(status);

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS audiences text[] NOT NULL DEFAULT ARRAY['lender','agent'];