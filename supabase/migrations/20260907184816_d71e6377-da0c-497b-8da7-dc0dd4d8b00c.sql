ALTER TABLE public.opportunity_outcomes
  ADD COLUMN IF NOT EXISTS next_step text,
  ADD COLUMN IF NOT EXISTS next_step_due_at timestamptz;

COMMENT ON COLUMN public.opportunity_outcomes.next_step IS 'Administrative follow-up SuCasa scheduled after this outcome. Never triggers outbound communication.';