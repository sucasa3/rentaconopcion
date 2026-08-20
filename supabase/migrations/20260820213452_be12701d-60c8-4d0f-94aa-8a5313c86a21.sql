CREATE TABLE public.business_task_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  status text NOT NULL DEFAULT 'done',
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, task_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_task_state TO authenticated;
GRANT ALL ON public.business_task_state TO service_role;

ALTER TABLE public.business_task_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own task state"
ON public.business_task_state
FOR ALL
TO authenticated
USING (user_id = auth.uid() AND public.is_lender_member(auth.uid(), org_id))
WITH CHECK (user_id = auth.uid() AND public.is_lender_member(auth.uid(), org_id));

CREATE TRIGGER trg_business_task_state_updated
BEFORE UPDATE ON public.business_task_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();