-- Stage 2: account deletion, minimal pseudonymous suppression register,
-- retained-record documentation, and business-record actor retention.

-- 1. Suppression register ----------------------------------------------------
-- Pseudonymous personal data: keyed HMACs only, never readable contact values.
-- Email and phone are the PRIMARY identity keys. Address is a SECONDARY
-- matching factor only and must never suppress on its own, so it is stored
-- without a unique index and is only ever consulted alongside another match.
CREATE TABLE public.deletion_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hmac text,
  phone_hmac text,
  address_hmac text,
  scope text NOT NULL DEFAULT 'all',
  event_type text NOT NULL DEFAULT 'account_deleted',
  source text NOT NULL DEFAULT 'account_settings',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Retained for as long as reasonably necessary to honor the person's
  -- opt-out or deletion preference and applicable legal obligations, using
  -- only the minimum identifiers necessary.
  review_after timestamptz,
  CONSTRAINT deletion_suppressions_identifier_present
    CHECK (email_hmac IS NOT NULL OR phone_hmac IS NOT NULL)
);

CREATE UNIQUE INDEX deletion_suppressions_email_key
  ON public.deletion_suppressions (email_hmac) WHERE email_hmac IS NOT NULL;
CREATE UNIQUE INDEX deletion_suppressions_phone_key
  ON public.deletion_suppressions (phone_hmac) WHERE phone_hmac IS NOT NULL;
CREATE INDEX deletion_suppressions_address_idx
  ON public.deletion_suppressions (address_hmac) WHERE address_hmac IS NOT NULL;

COMMENT ON TABLE public.deletion_suppressions IS
  'Pseudonymous suppression register. HMAC identifiers only; no readable email, phone, name or address.';
COMMENT ON COLUMN public.deletion_suppressions.address_hmac IS
  'Secondary matching factor only. Never suppresses on its own, so a future unrelated occupant is not suppressed.';

GRANT ALL ON public.deletion_suppressions TO service_role;
ALTER TABLE public.deletion_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read suppression register"
  ON public.deletion_suppressions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Deletion requests -------------------------------------------------------
CREATE TABLE public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_hmac text,
  status text NOT NULL DEFAULT 'pending',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  needs_admin_attention boolean NOT NULL DEFAULT false,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_deletion_requests_user_idx ON public.account_deletion_requests (user_id);
CREATE INDEX account_deletion_requests_attention_idx
  ON public.account_deletion_requests (needs_admin_attention) WHERE needs_admin_attention;

COMMENT ON TABLE public.account_deletion_requests IS
  'One row per deletion attempt. Survives the deleted account (no FK) so partial failures stay visible for administrative resolution.';

GRANT ALL ON public.account_deletion_requests TO service_role;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "People read their own deletion requests"
  ON public.account_deletion_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_account_deletion_requests_updated
  BEFORE UPDATE ON public.account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Records retained to finish or document an unfinished transaction --------
CREATE TABLE public.deletion_retained_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_request_id uuid REFERENCES public.account_deletion_requests(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id text,
  reason text NOT NULL,
  retained_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deletion_retained_records_request_idx
  ON public.deletion_retained_records (deletion_request_id);

COMMENT ON TABLE public.deletion_retained_records IS
  'Documents any limited record kept to complete or evidence an unfinished transaction (service request, payment, introduction, dispute), with the reason.';

GRANT ALL ON public.deletion_retained_records TO service_role;
ALTER TABLE public.deletion_retained_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read retained deletion records"
  ON public.deletion_retained_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Business records keep their history without blocking deletion -----------
-- These columns record which professional acted. They are nullable, and an
-- organization's own business record must survive the actor's account
-- deletion, so the references release instead of blocking it.
ALTER TABLE public.agent_lender_connections
  DROP CONSTRAINT agent_lender_connections_invited_by_fkey,
  ADD CONSTRAINT agent_lender_connections_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT agent_lender_connections_responded_by_fkey,
  ADD CONSTRAINT agent_lender_connections_responded_by_fkey
    FOREIGN KEY (responded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.agent_plans
  DROP CONSTRAINT agent_plans_requested_by_fkey,
  ADD CONSTRAINT agent_plans_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.batchdata_call_log
  DROP CONSTRAINT batchdata_call_log_requested_by_fkey,
  ADD CONSTRAINT batchdata_call_log_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.batchdata_test_runs
  DROP CONSTRAINT batchdata_test_runs_created_by_fkey,
  ADD CONSTRAINT batchdata_test_runs_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_activations
  DROP CONSTRAINT campaign_activations_created_by_fkey,
  ADD CONSTRAINT campaign_activations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_approvals
  DROP CONSTRAINT campaign_approvals_proposed_by_fkey,
  ADD CONSTRAINT campaign_approvals_proposed_by_fkey
    FOREIGN KEY (proposed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT campaign_approvals_responded_by_fkey,
  ADD CONSTRAINT campaign_approvals_responded_by_fkey
    FOREIGN KEY (responded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.introduction_requests
  DROP CONSTRAINT introduction_requests_requested_by_fkey,
  ADD CONSTRAINT introduction_requests_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  DROP CONSTRAINT introduction_requests_responded_by_fkey,
  ADD CONSTRAINT introduction_requests_responded_by_fkey
    FOREIGN KEY (responded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.introduction_reveals
  DROP CONSTRAINT introduction_reveals_viewed_by_fkey,
  ADD CONSTRAINT introduction_reveals_viewed_by_fkey
    FOREIGN KEY (viewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.opportunity_outcomes
  DROP CONSTRAINT opportunity_outcomes_actor_user_id_fkey,
  ADD CONSTRAINT opportunity_outcomes_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.outreach_messages
  DROP CONSTRAINT outreach_messages_actor_user_id_fkey,
  ADD CONSTRAINT outreach_messages_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sponsored_agent_seats
  DROP CONSTRAINT sponsored_agent_seats_created_by_fkey,
  ADD CONSTRAINT sponsored_agent_seats_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sponsored_profiles
  DROP CONSTRAINT sponsored_profiles_allocated_by_fkey,
  ADD CONSTRAINT sponsored_profiles_allocated_by_fkey
    FOREIGN KEY (allocated_by) REFERENCES auth.users(id) ON DELETE SET NULL;