-- SuCasa Daily Read email: send ledger, granular signal history, and the
-- per-professional notification preference (incl. delivery timezone).

CREATE TABLE public.daily_read_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  audience text NOT NULL,
  send_date date NOT NULL,
  state text NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  new_count integer NOT NULL DEFAULT 0,
  client_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  fingerprints jsonb NOT NULL DEFAULT '[]'::jsonb,
  unresolved_hash text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX daily_read_sends_unique_per_role_day
  ON public.daily_read_sends (user_id, org_id, audience, send_date);
CREATE INDEX daily_read_sends_recipient_recent
  ON public.daily_read_sends (user_id, org_id, audience, send_date DESC);

GRANT SELECT ON public.daily_read_sends TO authenticated;
GRANT ALL ON public.daily_read_sends TO service_role;
ALTER TABLE public.daily_read_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read their own Daily Read sends"
  ON public.daily_read_sends FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Granular history: what was surfaced, not merely which homeowner appeared.
CREATE TABLE public.daily_read_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  audience text NOT NULL,
  portfolio_client_id uuid,
  opportunity_id uuid,
  fingerprint text NOT NULL,
  category text,
  first_surfaced_at timestamptz NOT NULL DEFAULT now(),
  last_surfaced_at timestamptz NOT NULL DEFAULT now(),
  surface_count integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX daily_read_signals_unique_fingerprint
  ON public.daily_read_signals (user_id, org_id, audience, fingerprint);
CREATE INDEX daily_read_signals_client
  ON public.daily_read_signals (user_id, portfolio_client_id);

GRANT SELECT ON public.daily_read_signals TO authenticated;
GRANT ALL ON public.daily_read_signals TO service_role;
ALTER TABLE public.daily_read_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients read their own surfaced signals"
  ON public.daily_read_signals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Professional notification preference. Governs SuCasa's own emails to the
-- professional; unrelated to homeowner contact consent.
CREATE TABLE public.professional_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  audience text NOT NULL,
  daily_read_email_enabled boolean NOT NULL DEFAULT true,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX professional_notification_prefs_unique
  ON public.professional_notification_prefs (user_id, org_id, audience);

GRANT SELECT, INSERT, UPDATE ON public.professional_notification_prefs TO authenticated;
GRANT ALL ON public.professional_notification_prefs TO service_role;
ALTER TABLE public.professional_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals read their own notification preferences"
  ON public.professional_notification_prefs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Professionals create their own notification preferences"
  ON public.professional_notification_prefs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Professionals update their own notification preferences"
  ON public.professional_notification_prefs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER professional_notification_prefs_updated_at
  BEFORE UPDATE ON public.professional_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
