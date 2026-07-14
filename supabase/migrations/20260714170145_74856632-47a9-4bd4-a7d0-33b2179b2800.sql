
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fello_contact_id text,
  ADD COLUMN IF NOT EXISTS fello_estimated_value_cents bigint,
  ADD COLUMN IF NOT EXISTS fello_equity_cents bigint,
  ADD COLUMN IF NOT EXISTS fello_lead_score int,
  ADD COLUMN IF NOT EXISTS fello_last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_fello_contact_id ON public.profiles(fello_contact_id);

CREATE TABLE IF NOT EXISTS public.fello_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  fello_contact_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT SELECT ON public.fello_events TO authenticated;
GRANT ALL ON public.fello_events TO service_role;
ALTER TABLE public.fello_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all fello events"
  ON public.fello_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own fello events"
  ON public.fello_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_fello_events_contact ON public.fello_events(fello_contact_id);
CREATE INDEX IF NOT EXISTS idx_fello_events_user ON public.fello_events(user_id);
CREATE INDEX IF NOT EXISTS idx_fello_events_received ON public.fello_events(received_at DESC);

CREATE TABLE IF NOT EXISTS public.fello_webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fello_webhook_subscriptions TO authenticated;
GRANT ALL ON public.fello_webhook_subscriptions TO service_role;
ALTER TABLE public.fello_webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view fello subscriptions"
  ON public.fello_webhook_subscriptions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_fello_subs_updated_at
  BEFORE UPDATE ON public.fello_webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
