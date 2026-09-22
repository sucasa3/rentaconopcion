-- Verified contact-change requests (Stage 1 of the privacy compliance work).
-- A change to a phone number is only applied after a code sent to the NEW
-- number is entered back. Email changes go through the auth provider's own
-- confirmation flow and are not stored here.
CREATE TABLE public.account_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'phone',
  -- the proposed new value (the user's own contact detail)
  new_value text NOT NULL,
  -- HMAC of the verification code; the code itself is never stored
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_change_requests_kind_check CHECK (kind IN ('phone'))
);

CREATE INDEX account_change_requests_user_idx
  ON public.account_change_requests (user_id, created_at DESC);

GRANT SELECT ON public.account_change_requests TO authenticated;
GRANT ALL ON public.account_change_requests TO service_role;

ALTER TABLE public.account_change_requests ENABLE ROW LEVEL SECURITY;

-- Owners may see their own pending request (so the UI can show "code sent").
-- All writes go through server functions running with elevated privileges.
CREATE POLICY "Users read their own change requests"
  ON public.account_change_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_account_change_requests_updated
  BEFORE UPDATE ON public.account_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();