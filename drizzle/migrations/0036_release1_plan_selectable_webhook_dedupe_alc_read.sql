-- Plans can stay active (existing subscribers keep reading them) while
-- being withdrawn from new purchase.
ALTER TABLE public.plan_tiers ADD COLUMN IF NOT EXISTS selectable boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.plan_tiers.selectable IS 'false = kept for existing subscriptions/history, not offered or purchasable';
UPDATE public.plan_tiers SET selectable = false WHERE key IN ('mlo_growth');

-- Payment-provider webhook events processed once each.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  livemode boolean NOT NULL,
  object_id text,
  event_created timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Lender-side read: officers see relationships they own; branch managers
-- (team plan + manager role) and platform admins see the branch's. Agent-side
-- members keep seeing their own org's relationships.
DROP POLICY IF EXISTS alc_read_either_side ON public.agent_lender_connections;
CREATE POLICY alc_read_scoped ON public.agent_lender_connections
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (agent_org_id IS NOT NULL AND private.is_lender_member(auth.uid(), agent_org_id))
  OR (
    private.is_lender_member(auth.uid(), lender_org_id)
    AND (owner_user_id = auth.uid() OR public.lender_is_team_manager(auth.uid(), lender_org_id))
  )
);