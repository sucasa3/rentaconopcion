-- 1. Home memory
CREATE TABLE public.home_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'note',
  memory_key text NOT NULL,
  label text NOT NULL,
  value text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'agent',
  confidence numeric NOT NULL DEFAULT 0.8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, memory_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_memory TO authenticated;
GRANT ALL ON public.home_memory TO service_role;
ALTER TABLE public.home_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners manage their own home memory" ON public.home_memory
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_home_memory_updated BEFORE UPDATE ON public.home_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Conversations
CREATE TABLE public.agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_conversations TO authenticated;
GRANT ALL ON public.agent_conversations TO service_role;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners manage their own agent conversations" ON public.agent_conversations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_agent_conversations_updated BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_agent_conversations_user ON public.agent_conversations (user_id, last_message_at DESC);

-- 3. Messages
CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  tool_activity jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_messages TO authenticated;
GRANT ALL ON public.agent_messages TO service_role;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners manage their own agent messages" ON public.agent_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_agent_messages_conv ON public.agent_messages (conversation_id, created_at);

-- 4. Intents
CREATE TABLE public.homeowner_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  intent_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  confidence numeric NOT NULL DEFAULT 0.6,
  evidence text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'agent',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, intent_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homeowner_intents TO authenticated;
GRANT ALL ON public.homeowner_intents TO service_role;
ALTER TABLE public.homeowner_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners manage their own intents" ON public.homeowner_intents
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_homeowner_intents_updated BEFORE UPDATE ON public.homeowner_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Permissions
CREATE TABLE public.agent_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  capability text NOT NULL,
  level smallint NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, capability)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_permissions TO authenticated;
GRANT ALL ON public.agent_permissions TO service_role;
ALTER TABLE public.agent_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners manage their own agent permissions" ON public.agent_permissions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_agent_permissions_updated BEFORE UPDATE ON public.agent_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Actions
CREATE TABLE public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  capability text NOT NULL,
  title text NOT NULL,
  summary text,
  rationale text,
  source_kind text,
  source_key text,
  required_level smallint NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'proposed',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  conversation_id uuid REFERENCES public.agent_conversations(id) ON DELETE SET NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_actions TO authenticated;
GRANT ALL ON public.agent_actions TO service_role;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners manage their own agent actions" ON public.agent_actions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_agent_actions_updated BEFORE UPDATE ON public.agent_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_agent_actions_user_status ON public.agent_actions (user_id, status, proposed_at DESC);
CREATE UNIQUE INDEX idx_agent_actions_source ON public.agent_actions (user_id, source_key) WHERE source_key IS NOT NULL;