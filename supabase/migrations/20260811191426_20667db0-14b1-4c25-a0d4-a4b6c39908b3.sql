-- 1. Restrict campaigns + plan_tiers reads to admins and org members
DROP POLICY IF EXISTS campaigns_read ON public.campaigns;
CREATE POLICY campaigns_read ON public.campaigns
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.lender_members m WHERE m.user_id = auth.uid())
);

DROP POLICY IF EXISTS plan_tiers_read ON public.plan_tiers;
CREATE POLICY plan_tiers_read ON public.plan_tiers
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.lender_members m WHERE m.user_id = auth.uid())
);

-- 2. Lock down SECURITY DEFINER functions exposed through the API
REVOKE EXECUTE ON FUNCTION public.portfolio_engagement(uuid) FROM PUBLIC, anon;

-- Add an in-function authorization check so signed-in users can only read
-- engagement for portfolios owned by an org they belong to.
CREATE OR REPLACE FUNCTION public.portfolio_engagement(_portfolio_id uuid)
RETURNS TABLE(portfolio_client_id uuid, value_checks_14d integer, value_checks_30d integer, equity_checks_30d integer, distinct_types_14d integer, sessions_7d integer, last_activity_at timestamp with time zone, selling_form_timeframe text, selling_form_at timestamp with time zone, value_request_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.lender_portfolios p
      JOIN public.lender_members m ON m.lender_org_id = p.lender_org_id
      WHERE p.id = _portfolio_id AND m.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden: not a member of this portfolio''s organization';
  END IF;

  RETURN QUERY
  WITH cl AS (
    SELECT c.id, c.homeowner_id
    FROM public.lender_portfolio_clients c
    WHERE c.portfolio_id = _portfolio_id
  ),
  ev AS (
    SELECT e.homeowner_id, e.event_type, e.occurred_at
    FROM public.homeowner_activity_events e
    WHERE e.homeowner_id IN (SELECT cl.homeowner_id FROM cl WHERE cl.homeowner_id IS NOT NULL)
      AND e.occurred_at > now() - interval '30 days'
  ),
  si AS (
    SELECT s.homeowner_id, s.timeframe, s.created_at,
           row_number() OVER (PARTITION BY s.homeowner_id ORDER BY s.created_at DESC) rn
    FROM public.seller_intent_submissions s
    WHERE s.homeowner_id IN (SELECT cl.homeowner_id FROM cl WHERE cl.homeowner_id IS NOT NULL)
  )
  SELECT
    cl.id,
    COALESCE((SELECT count(*)::int FROM ev WHERE ev.homeowner_id = cl.homeowner_id AND ev.event_type = 'value_check' AND ev.occurred_at > now() - interval '14 days'), 0),
    COALESCE((SELECT count(*)::int FROM ev WHERE ev.homeowner_id = cl.homeowner_id AND ev.event_type = 'value_check'), 0),
    COALESCE((SELECT count(*)::int FROM ev WHERE ev.homeowner_id = cl.homeowner_id AND ev.event_type = 'equity_view'), 0),
    COALESCE((SELECT count(DISTINCT ev.event_type)::int FROM ev WHERE ev.homeowner_id = cl.homeowner_id AND ev.occurred_at > now() - interval '14 days'), 0),
    COALESCE((SELECT count(DISTINCT date_trunc('day', ev.occurred_at))::int FROM ev WHERE ev.homeowner_id = cl.homeowner_id AND ev.occurred_at > now() - interval '7 days'), 0),
    (SELECT max(ev.occurred_at) FROM ev WHERE ev.homeowner_id = cl.homeowner_id),
    (SELECT si.timeframe FROM si WHERE si.homeowner_id = cl.homeowner_id AND si.rn = 1),
    (SELECT si.created_at FROM si WHERE si.homeowner_id = cl.homeowner_id AND si.rn = 1),
    (SELECT max(ev.occurred_at) FROM ev WHERE ev.homeowner_id = cl.homeowner_id AND ev.event_type = 'value_request')
  FROM cl;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.portfolio_engagement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portfolio_engagement(uuid) TO authenticated, service_role;