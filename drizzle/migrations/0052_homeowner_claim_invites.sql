CREATE TABLE public.homeowner_claim_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  created_by uuid NOT NULL,
  email text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  link_copied_at timestamptz,
  revoked_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid,
  home_confirmed_at timestamptz,
  home_corrected boolean NOT NULL DEFAULT false,
  corrected_address text,
  connection_outcome text CHECK (connection_outcome IN ('accepted','declined','conflict')),
  activated_at timestamptz
);
CREATE INDEX ON public.homeowner_claim_invites(client_id, created_at DESC);
CREATE INDEX ON public.homeowner_claim_invites(claimed_by);
GRANT ALL ON public.homeowner_claim_invites TO service_role;
ALTER TABLE public.homeowner_claim_invites ENABLE ROW LEVEL SECURITY;

-- Activation = verified claim + confirmed home + first saved maintenance item.
CREATE OR REPLACE FUNCTION public.tg_claim_activation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.homeowner_claim_invites
     SET activated_at = now()
   WHERE claimed_by = NEW.user_id AND claimed_at IS NOT NULL
     AND home_confirmed_at IS NOT NULL AND activated_at IS NULL;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_claim_activation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER claim_activation AFTER INSERT ON public.home_component_service_log
FOR EACH ROW EXECUTE FUNCTION public.tg_claim_activation();