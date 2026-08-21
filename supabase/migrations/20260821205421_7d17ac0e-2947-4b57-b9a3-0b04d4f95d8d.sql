-- Structured facts extracted by AI from any uploaded home document.
CREATE TABLE public.home_document_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.home_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  doc_kind text NOT NULL,
  label text NOT NULL,
  value text,
  value_date date,
  value_cents bigint,
  system text,
  confidence numeric,
  source_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.home_document_facts TO authenticated;
GRANT ALL ON public.home_document_facts TO service_role;
ALTER TABLE public.home_document_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their document facts"
ON public.home_document_facts FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_home_document_facts_user ON public.home_document_facts(user_id);
CREATE INDEX idx_home_document_facts_doc ON public.home_document_facts(document_id);

-- Forward-looking actions predicted from documents + property signals.
CREATE TABLE public.home_predicted_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid REFERENCES public.home_documents(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  title text NOT NULL,
  why text,
  system text,
  service_category text,
  urgency text NOT NULL DEFAULT 'monitor',
  due_from date,
  due_by date,
  est_cost_low_cents bigint,
  est_cost_high_cents bigint,
  status text NOT NULL DEFAULT 'open',
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_key)
);

GRANT SELECT, UPDATE ON public.home_predicted_actions TO authenticated;
GRANT ALL ON public.home_predicted_actions TO service_role;
ALTER TABLE public.home_predicted_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their predicted actions"
ON public.home_predicted_actions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners update their predicted actions"
ON public.home_predicted_actions FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_home_predicted_actions_user ON public.home_predicted_actions(user_id, status);

CREATE TRIGGER trg_home_predicted_actions_updated
BEFORE UPDATE ON public.home_predicted_actions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AI usage accounting (per user / org / feature) for caps and admin visibility.
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  org_id uuid REFERENCES public.lender_orgs(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  cost_micro_cents bigint NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own AI usage; admins read all"
ON public.ai_usage_log FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ai_usage_log_user_month ON public.ai_usage_log(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_log_org_month ON public.ai_usage_log(org_id, created_at DESC);