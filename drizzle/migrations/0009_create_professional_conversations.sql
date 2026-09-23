-- Post-call voice notes: the rich, auditable record of a professional's
-- conversation with a homeowner in their own book. Relationship intelligence
-- only — never overwrites authoritative property or contact data.
CREATE TABLE public.professional_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id),
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id),
  opportunity_id uuid REFERENCES public.homeowner_opportunities(id),
  outcome_id uuid REFERENCES public.opportunity_outcomes(id),
  created_by uuid NOT NULL,
  source text NOT NULL DEFAULT 'post_call_voice',
  transcript text NOT NULL,
  original_language text NOT NULL DEFAULT 'en',
  summary text NOT NULL,
  outcome_stage text,
  key_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_step text,
  follow_up_date date,
  follow_up_timeframe_text text,
  follow_up_reason text,
  suggested_opener text,
  edited_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX professional_conversations_client_idx
  ON public.professional_conversations (org_id, portfolio_client_id, created_at DESC);

GRANT SELECT, INSERT ON public.professional_conversations TO authenticated;
GRANT ALL ON public.professional_conversations TO service_role;

ALTER TABLE public.professional_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read conversations"
  ON public.professional_conversations FOR SELECT TO authenticated
  USING (is_lender_member(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org members record conversations"
  ON public.professional_conversations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (is_lender_member(auth.uid(), org_id) OR has_role(auth.uid(), 'admin'::app_role)));

-- Atomic save: the outcome row (which the existing Today/follow-up logic
-- already reads) and the conversation row are written in ONE transaction.
-- If either insert fails, both roll back. Runs as the caller, so RLS applies.
CREATE OR REPLACE FUNCTION public.record_post_call_save(
  p_org_id uuid,
  p_client_id uuid,
  p_opportunity_id uuid,
  p_stage text,
  p_note text,
  p_next_step text,
  p_next_step_due_at timestamptz,
  p_transcript text,
  p_language text,
  p_summary text,
  p_key_facts jsonb,
  p_follow_up_date date,
  p_timeframe_text text,
  p_follow_up_reason text,
  p_suggested_opener text,
  p_edited_fields jsonb,
  p_source text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_outcome_id uuid;
  v_conversation_id uuid;
BEGIN
  INSERT INTO public.opportunity_outcomes (
    org_id, portfolio_client_id, opportunity_id, actor_user_id,
    stage, note, next_step, next_step_due_at
  ) VALUES (
    p_org_id, p_client_id, p_opportunity_id, auth.uid(),
    p_stage, p_note, p_next_step, p_next_step_due_at
  )
  RETURNING id INTO v_outcome_id;

  -- Mirror the existing one-tap logger: terminal stages close the opportunity.
  IF p_stage IN ('closed', 'not_interested') AND p_opportunity_id IS NOT NULL THEN
    UPDATE public.homeowner_opportunities
      SET state = CASE WHEN p_stage = 'closed' THEN 'won' ELSE 'dismissed' END
      WHERE id = p_opportunity_id;
  END IF;

  INSERT INTO public.professional_conversations (
    org_id, portfolio_client_id, opportunity_id, outcome_id, created_by,
    source, transcript, original_language, summary, outcome_stage,
    key_facts, next_step, follow_up_date, follow_up_timeframe_text,
    follow_up_reason, suggested_opener, edited_fields
  ) VALUES (
    p_org_id, p_client_id, p_opportunity_id, v_outcome_id, auth.uid(),
    p_source, p_transcript, p_language, p_summary, p_stage,
    COALESCE(p_key_facts, '[]'::jsonb), p_next_step, p_follow_up_date,
    p_timeframe_text, p_follow_up_reason, p_suggested_opener,
    COALESCE(p_edited_fields, '[]'::jsonb)
  )
  RETURNING id INTO v_conversation_id;

  RETURN v_conversation_id;
END;
$$;