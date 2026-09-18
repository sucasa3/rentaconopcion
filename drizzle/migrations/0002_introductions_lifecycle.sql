-- Canonical lender -> agent -> homeowner introduction lifecycle.
-- The legacy public.introduction_requests table is left completely untouched so
-- the historical audit trail of the pre-consent workflow stays accurate.

CREATE TABLE public.introductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.agent_lender_connections(id) ON DELETE CASCADE,
  lender_org_id UUID NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  agent_org_id UUID NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  -- Broad financing category the lender asked about. Never a person.
  category TEXT NOT NULL,
  message TEXT,
  state TEXT NOT NULL DEFAULT 'lender_requested'
    CHECK (state IN ('lender_requested','agent_declined','agent_offered','homeowner_declined','homeowner_accepted','connection_active','permission_revoked')),
  -- NULL until the agent privately selects one of their own clients.
  portfolio_client_id UUID REFERENCES public.lender_portfolio_clients(id) ON DELETE SET NULL,
  requested_by UUID,
  lender_requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  agent_responded_by UUID,
  agent_responded_at TIMESTAMPTZ,
  agent_note TEXT,
  homeowner_invited_at TIMESTAMPTZ,
  invited_email TEXT,
  invite_nonce TEXT,
  invite_expires_at TIMESTAMPTZ,
  invite_viewed_at TIMESTAMPTZ,
  invite_used_at TIMESTAMPTZ,
  homeowner_responded_at TIMESTAMPTZ,
  homeowner_decision TEXT CHECK (homeowner_decision IS NULL OR homeowner_decision IN ('accepted','declined')),
  revoked_at TIMESTAMPTZ,
  legacy_request_id UUID,
  legacy_migration_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX introductions_agent_idx ON public.introductions(agent_org_id, state);
CREATE INDEX introductions_lender_idx ON public.introductions(lender_org_id, state);
CREATE INDEX introductions_client_idx ON public.introductions(portfolio_client_id);
CREATE UNIQUE INDEX introductions_legacy_uniq ON public.introductions(legacy_request_id) WHERE legacy_request_id IS NOT NULL;

GRANT SELECT ON public.introductions TO authenticated;
GRANT ALL ON public.introductions TO service_role;
ALTER TABLE public.introductions ENABLE ROW LEVEL SECURITY;

-- Only the agent side (owner of the client relationship) and admins may read
-- rows directly. Lender-side reads go exclusively through server functions that
-- project a minimized, state-gated shape.
CREATE POLICY introductions_agent_read ON public.introductions
  FOR SELECT TO authenticated
  USING (private.is_lender_member(auth.uid(), agent_org_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER introductions_touch BEFORE UPDATE ON public.introductions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Channel-specific homeowner authorization. Revoking one channel never revokes
-- the others; the introduction stays connection_active while one remains.
CREATE TABLE public.introduction_channel_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  introduction_id UUID NOT NULL REFERENCES public.introductions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('call','text','email')),
  status TEXT NOT NULL DEFAULT 'granted' CHECK (status IN ('granted','revoked')),
  authorized_value TEXT,
  disclosure_version TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (introduction_id, channel)
);

CREATE INDEX intro_grants_intro_idx ON public.introduction_channel_grants(introduction_id, status);

GRANT SELECT ON public.introduction_channel_grants TO authenticated;
GRANT ALL ON public.introduction_channel_grants TO service_role;
ALTER TABLE public.introduction_channel_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY intro_grants_agent_read ON public.introduction_channel_grants
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.introductions i
      WHERE i.id = introduction_channel_grants.introduction_id
        AND private.is_lender_member(auth.uid(), i.agent_org_id)
    )
  );

-- Internal compliance ledger. Append-only, never exposed to lenders or agents
-- directly: every read goes through server code that decides what may be shown.
CREATE TABLE public.introduction_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  introduction_id UUID NOT NULL REFERENCES public.introductions(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  portfolio_client_id UUID,
  homeowner_id UUID,
  agent_org_id UUID,
  agent_actor_id UUID,
  lender_org_id UUID,
  lender_org_name_shown TEXT,
  lender_contact_name_shown TEXT,
  delivered_to_email TEXT,
  channels TEXT[] NOT NULL DEFAULT '{}',
  authorized_phone TEXT,
  authorized_email TEXT,
  disclosure_version TEXT,
  disclosure_text TEXT,
  language TEXT,
  decision TEXT,
  ip_address TEXT,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intro_consent_events_intro_idx ON public.introduction_consent_events(introduction_id, occurred_at);

GRANT ALL ON public.introduction_consent_events TO service_role;
ALTER TABLE public.introduction_consent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY intro_consent_events_admin_read ON public.introduction_consent_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Freeze legacy approved introductions: carried over as agent_offered, awaiting
-- homeowner consent under the new flow. No consent is backfilled and no
-- invitation is sent automatically.
INSERT INTO public.introductions (
  connection_id, lender_org_id, agent_org_id, category, message, state,
  portfolio_client_id, requested_by, lender_requested_at, agent_responded_by,
  agent_responded_at, legacy_request_id, legacy_migration_reason, created_at
)
SELECT r.connection_id, r.lender_org_id, r.agent_org_id,
       COALESCE(r.category, 'refinance_review'), r.message, 'agent_offered',
       r.portfolio_client_id, r.requested_by, r.created_at, r.responded_by,
       r.responded_at, r.id, 'legacy_pre_consent_workflow', r.created_at
FROM public.introduction_requests r
WHERE r.status = 'approved';