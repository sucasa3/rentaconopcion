-- ---------------------------------------------------------------------------
-- Homeowner behavioral activity (High Intent Seller signals)
-- ---------------------------------------------------------------------------
CREATE TABLE public.homeowner_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hae_owner_time ON public.homeowner_activity_events (homeowner_id, occurred_at DESC);
CREATE INDEX idx_hae_type_time ON public.homeowner_activity_events (event_type, occurred_at DESC);

GRANT SELECT, INSERT ON public.homeowner_activity_events TO authenticated;
GRANT ALL ON public.homeowner_activity_events TO service_role;
ALTER TABLE public.homeowner_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hae_own_read" ON public.homeowner_activity_events
  FOR SELECT TO authenticated USING (homeowner_id = auth.uid());
CREATE POLICY "hae_own_insert" ON public.homeowner_activity_events
  FOR INSERT TO authenticated WITH CHECK (homeowner_id = auth.uid());
CREATE POLICY "hae_admin_read" ON public.homeowner_activity_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Explicit seller intent submissions
-- ---------------------------------------------------------------------------
CREATE TABLE public.seller_intent_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('value_request', 'selling_interest')),
  timeframe text CHECK (timeframe IN ('now', '3_6_months', '12_months', 'curious')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sis_owner_time ON public.seller_intent_submissions (homeowner_id, created_at DESC);

GRANT SELECT, INSERT ON public.seller_intent_submissions TO authenticated;
GRANT ALL ON public.seller_intent_submissions TO service_role;
ALTER TABLE public.seller_intent_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sis_own_read" ON public.seller_intent_submissions
  FOR SELECT TO authenticated USING (homeowner_id = auth.uid());
CREATE POLICY "sis_own_insert" ON public.seller_intent_submissions
  FOR INSERT TO authenticated WITH CHECK (homeowner_id = auth.uid());
CREATE POLICY "sis_admin_read" ON public.seller_intent_submissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_sis_updated BEFORE UPDATE ON public.seller_intent_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Aggregate-only engagement read for agents.
-- Returns counts and recency per portfolio client -- never the raw log.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portfolio_engagement(_portfolio_id uuid)
RETURNS TABLE (
  portfolio_client_id uuid,
  value_checks_14d integer,
  value_checks_30d integer,
  equity_checks_30d integer,
  distinct_types_14d integer,
  sessions_7d integer,
  last_activity_at timestamptz,
  selling_form_timeframe text,
  selling_form_at timestamptz,
  value_request_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS portfolio_client_id,
    COALESCE(SUM(CASE WHEN e.event_type IN ('value_viewed','value_refreshed')
      AND e.occurred_at > now() - interval '14 days' THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN e.event_type IN ('value_viewed','value_refreshed')
      AND e.occurred_at > now() - interval '30 days' THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN e.event_type IN ('equity_opened','refi_opened')
      AND e.occurred_at > now() - interval '30 days' THEN 1 ELSE 0 END), 0)::int,
    COALESCE(COUNT(DISTINCT CASE WHEN e.occurred_at > now() - interval '14 days'
      THEN e.event_type END), 0)::int,
    COALESCE(COUNT(DISTINCT CASE WHEN e.occurred_at > now() - interval '7 days'
      THEN date_trunc('day', e.occurred_at) END), 0)::int,
    MAX(e.occurred_at),
    (SELECT s.timeframe FROM public.seller_intent_submissions s
      WHERE s.homeowner_id = c.homeowner_id AND s.kind = 'selling_interest'
      ORDER BY s.created_at DESC LIMIT 1),
    (SELECT s.created_at FROM public.seller_intent_submissions s
      WHERE s.homeowner_id = c.homeowner_id AND s.kind = 'selling_interest'
      ORDER BY s.created_at DESC LIMIT 1),
    (SELECT s.created_at FROM public.seller_intent_submissions s
      WHERE s.homeowner_id = c.homeowner_id AND s.kind = 'value_request'
      ORDER BY s.created_at DESC LIMIT 1)
  FROM public.lender_portfolio_clients c
  JOIN public.lender_portfolios p ON p.id = c.portfolio_id
  LEFT JOIN public.homeowner_activity_events e
    ON e.homeowner_id = c.homeowner_id
   AND e.occurred_at > now() - interval '90 days'
  WHERE c.portfolio_id = _portfolio_id
    AND c.homeowner_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lender_members m
      WHERE m.lender_org_id = p.lender_org_id
        AND m.user_id = auth.uid()
    )
  GROUP BY c.id, c.homeowner_id;
$$;

REVOKE ALL ON FUNCTION public.portfolio_engagement(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.portfolio_engagement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portfolio_engagement(uuid) TO service_role;