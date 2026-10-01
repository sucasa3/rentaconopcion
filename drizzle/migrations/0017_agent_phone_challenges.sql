CREATE TABLE public.agent_phone_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_hash text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.agent_phone_challenges TO service_role;
ALTER TABLE public.agent_phone_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX agent_phone_challenges_user_idx ON public.agent_phone_challenges (user_id, created_at DESC);
CREATE INDEX agent_phone_challenges_phone_idx ON public.agent_phone_challenges (phone_hash, created_at DESC);