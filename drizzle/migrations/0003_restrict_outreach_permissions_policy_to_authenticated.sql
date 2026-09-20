DROP POLICY IF EXISTS "Org members manage outreach permissions in their book" ON public.outreach_channel_permissions;

CREATE POLICY "Org members manage outreach permissions in their book"
  ON public.outreach_channel_permissions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.lender_portfolio_clients c
      JOIN public.lender_portfolios p ON p.id = c.portfolio_id
      WHERE c.id = outreach_channel_permissions.portfolio_client_id
        AND public.is_lender_member(auth.uid(), p.lender_org_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.lender_portfolio_clients c
      JOIN public.lender_portfolios p ON p.id = c.portfolio_id
      WHERE c.id = outreach_channel_permissions.portfolio_client_id
        AND public.is_lender_member(auth.uid(), p.lender_org_id)
    )
  );