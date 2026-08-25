CREATE TABLE public.home_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  source_hash text NOT NULL,
  plan jsonb NOT NULL,
  ai_why jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_plans TO authenticated;
GRANT ALL ON public.home_plans TO service_role;

ALTER TABLE public.home_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowners manage their own plan"
  ON public.home_plans FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_home_plans_updated BEFORE UPDATE ON public.home_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.home_plan_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('done','dismissed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_plan_state TO authenticated;
GRANT ALL ON public.home_plan_state TO service_role;

ALTER TABLE public.home_plan_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowners manage their own plan state"
  ON public.home_plan_state FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_home_plan_state_updated BEFORE UPDATE ON public.home_plan_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();