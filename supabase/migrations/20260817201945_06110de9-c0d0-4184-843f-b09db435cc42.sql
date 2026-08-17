
-- campaign_sends
DROP POLICY IF EXISTS campaign_sends_org_read ON public.campaign_sends;
CREATE POLICY campaign_sends_org_read ON public.campaign_sends
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR homeowner_id = auth.uid()
  OR (
    lender_org_id IS NOT NULL
    AND private.is_lender_member(auth.uid(), lender_org_id)
    AND private.has_homeowner_consent(homeowner_id, lender_org_id)
  )
);

-- homeowner_opportunities
DROP POLICY IF EXISTS opportunities_org_members_manage ON public.homeowner_opportunities;
CREATE POLICY opportunities_org_members_manage ON public.homeowner_opportunities
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.is_lender_member(auth.uid(), org_id)
    AND EXISTS (
      SELECT 1 FROM public.lender_portfolio_clients c
      WHERE c.id = homeowner_opportunities.portfolio_client_id
        AND private.has_homeowner_consent(c.homeowner_id, homeowner_opportunities.org_id)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.is_lender_member(auth.uid(), org_id)
    AND EXISTS (
      SELECT 1 FROM public.lender_portfolio_clients c
      WHERE c.id = homeowner_opportunities.portfolio_client_id
        AND private.has_homeowner_consent(c.homeowner_id, homeowner_opportunities.org_id)
    )
  )
);

-- lender_activity
DROP POLICY IF EXISTS lender_activity_member_all ON public.lender_activity;
CREATE POLICY lender_activity_member_all ON public.lender_activity
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.is_lender_member(auth.uid(), lender_org_id)
    AND (
      portfolio_client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.lender_portfolio_clients c
        WHERE c.id = lender_activity.portfolio_client_id
          AND private.has_homeowner_consent(c.homeowner_id, lender_activity.lender_org_id)
      )
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    private.is_lender_member(auth.uid(), lender_org_id)
    AND (
      portfolio_client_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.lender_portfolio_clients c
        WHERE c.id = lender_activity.portfolio_client_id
          AND private.has_homeowner_consent(c.homeowner_id, lender_activity.lender_org_id)
      )
    )
  )
);

-- property_listing_status
DROP POLICY IF EXISTS "Org members manage listing status" ON public.property_listing_status;
CREATE POLICY "Org members manage listing status" ON public.property_listing_status
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.lender_portfolio_clients c
    JOIN public.lender_portfolios p ON p.id = c.portfolio_id
    JOIN public.lender_members m ON m.lender_org_id = p.lender_org_id
    WHERE c.id = property_listing_status.portfolio_client_id
      AND m.user_id = auth.uid()
      AND private.has_homeowner_consent(c.homeowner_id, p.lender_org_id)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.lender_portfolio_clients c
    JOIN public.lender_portfolios p ON p.id = c.portfolio_id
    JOIN public.lender_members m ON m.lender_org_id = p.lender_org_id
    WHERE c.id = property_listing_status.portfolio_client_id
      AND m.user_id = auth.uid()
      AND private.has_homeowner_consent(c.homeowner_id, p.lender_org_id)
  )
);
