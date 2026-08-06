ALTER TABLE public.lender_orgs
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS reply_to_email text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_title text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS signoff text;

CREATE TABLE public.campaign_org_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  subject text,
  intro text,
  closing text,
  cta_label text,
  cta_url text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lender_org_id, campaign_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_org_overrides TO authenticated;
GRANT ALL ON public.campaign_org_overrides TO service_role;

ALTER TABLE public.campaign_org_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage their campaign overrides"
ON public.campaign_org_overrides
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lender_members m
    WHERE m.lender_org_id = campaign_org_overrides.lender_org_id
      AND m.user_id = auth.uid()
  ) OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lender_members m
    WHERE m.lender_org_id = campaign_org_overrides.lender_org_id
      AND m.user_id = auth.uid()
  ) OR public.has_role(auth.uid(), 'admin')
);

CREATE TRIGGER trg_campaign_org_overrides_updated
BEFORE UPDATE ON public.campaign_org_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();