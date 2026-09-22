-- Person-level communication preferences and append-only consent/preference evidence.
-- Preferences are keyed by account id when known, and otherwise by pseudonymous
-- keyed identifiers (HMAC of email / phone) so an unsubscribe works without a login.

CREATE TABLE public.communication_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email_hmac text,
  phone_hmac text,
  marketing_email boolean NOT NULL DEFAULT true,
  marketing_sms boolean NOT NULL DEFAULT true,
  marketing_calls boolean NOT NULL DEFAULT true,
  -- Set when a provider-side STOP (or any authoritative opt-out) means renewed
  -- express consent is required before marketing texts may resume.
  sms_consent_required boolean NOT NULL DEFAULT false,
  sms_consent_version text,
  sms_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX communication_preferences_user_key
  ON public.communication_preferences (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX communication_preferences_email_key
  ON public.communication_preferences (email_hmac) WHERE email_hmac IS NOT NULL;
CREATE UNIQUE INDEX communication_preferences_phone_key
  ON public.communication_preferences (phone_hmac) WHERE phone_hmac IS NOT NULL;

GRANT SELECT ON public.communication_preferences TO authenticated;
GRANT ALL ON public.communication_preferences TO service_role;

ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own communication preferences"
  ON public.communication_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_communication_preferences_updated
  BEFORE UPDATE ON public.communication_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Append-only evidence: prior state, new state, channel, scope, source, timestamp,
-- and consent wording/version where renewed consent was required. No message bodies.
CREATE TABLE public.communication_preference_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email_hmac text,
  phone_hmac text,
  channel text NOT NULL,
  scope text NOT NULL DEFAULT 'marketing',
  prior_state jsonb,
  new_state jsonb,
  source text NOT NULL,
  consent_version text,
  consent_text text,
  provider_message_id text,
  web_event_id text,
  ip text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX communication_preference_events_user_idx
  ON public.communication_preference_events (user_id, occurred_at DESC);
CREATE INDEX communication_preference_events_email_idx
  ON public.communication_preference_events (email_hmac, occurred_at DESC);

GRANT SELECT ON public.communication_preference_events TO authenticated;
GRANT ALL ON public.communication_preference_events TO service_role;

ALTER TABLE public.communication_preference_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own preference history"
  ON public.communication_preference_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));