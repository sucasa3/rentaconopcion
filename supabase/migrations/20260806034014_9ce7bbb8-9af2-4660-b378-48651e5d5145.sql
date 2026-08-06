CREATE TABLE public.agent_feed_seen (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  portfolio_id uuid NOT NULL,
  item_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('recommendation','referral')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, portfolio_id, item_key)
);

CREATE INDEX idx_agent_feed_seen_lookup ON public.agent_feed_seen (user_id, portfolio_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_feed_seen TO authenticated;
GRANT ALL ON public.agent_feed_seen TO service_role;

ALTER TABLE public.agent_feed_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents manage their own feed state"
ON public.agent_feed_seen FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_agent_feed_seen_updated
BEFORE UPDATE ON public.agent_feed_seen
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();