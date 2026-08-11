DROP POLICY IF EXISTS "sponsored_agent_allocates" ON public.sponsored_profiles;

CREATE POLICY "sponsored_sponsor_allocates" ON public.sponsored_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      private.is_lender_member(auth.uid(), sponsor_org_id)
      AND EXISTS (
        SELECT 1 FROM public.agent_lender_connections c
        WHERE c.status = 'accepted'
          AND c.lender_org_id = sponsored_profiles.sponsor_org_id
          AND c.agent_org_id = sponsored_profiles.agent_org_id
      )
    )
  );