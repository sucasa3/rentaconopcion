DROP POLICY IF EXISTS "Org members manage outreach permissions in their book" ON public.outreach_channel_permissions;

CREATE POLICY "Org members manage outreach permissions in their book"
ON public.outreach_channel_permissions
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.lender_portfolio_clients c
    JOIN public.lender_portfolios p ON p.id = c.portfolio_id
    WHERE c.id = outreach_channel_permissions.portfolio_client_id
      AND is_lender_member(auth.uid(), p.lender_org_id)
      AND private.has_homeowner_consent(c.homeowner_id, p.lender_org_id)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.lender_portfolio_clients c
    JOIN public.lender_portfolios p ON p.id = c.portfolio_id
    WHERE c.id = outreach_channel_permissions.portfolio_client_id
      AND is_lender_member(auth.uid(), p.lender_org_id)
      AND private.has_homeowner_consent(c.homeowner_id, p.lender_org_id)
  )
);