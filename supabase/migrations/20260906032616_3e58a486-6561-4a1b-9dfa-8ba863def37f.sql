-- data_provider_health: restrict reads to platform admins (admin ALL policy already covers them)
DROP POLICY IF EXISTS "Authenticated users can read provider health" ON public.data_provider_health;

-- campaigns: members see active templates only; admins see all
DROP POLICY IF EXISTS campaigns_read ON public.campaigns;
CREATE POLICY campaigns_read ON public.campaigns FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    active = true
    AND EXISTS (SELECT 1 FROM lender_members m WHERE m.user_id = auth.uid())
  )
);

-- plan_tiers: members see active plans only; admins see all
DROP POLICY IF EXISTS plan_tiers_read ON public.plan_tiers;
CREATE POLICY plan_tiers_read ON public.plan_tiers FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    active = true
    AND EXISTS (SELECT 1 FROM lender_members m WHERE m.user_id = auth.uid())
  )
);