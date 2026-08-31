CREATE TABLE public.home_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  address text,
  address_normalized text,
  property jsonb NOT NULL DEFAULT '{}'::jsonb,
  financial jsonb NOT NULL DEFAULT '{}'::jsonb,
  physical jsonb NOT NULL DEFAULT '{}'::jsonb,
  behavior jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness_pct integer NOT NULL DEFAULT 0,
  stale_classes text[] NOT NULL DEFAULT '{}',
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  provider_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_home_profiles_user ON public.home_profiles(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_profiles TO authenticated;
GRANT ALL ON public.home_profiles TO service_role;

ALTER TABLE public.home_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowners read their own home profile"
  ON public.home_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Homeowners create their own home profile"
  ON public.home_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Homeowners update their own home profile"
  ON public.home_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Homeowners delete their own home profile"
  ON public.home_profiles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_home_profiles_updated
  BEFORE UPDATE ON public.home_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();