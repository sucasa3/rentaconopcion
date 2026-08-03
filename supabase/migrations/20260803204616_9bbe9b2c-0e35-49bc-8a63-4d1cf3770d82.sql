ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_language_check CHECK (language IN ('en','es'));

ALTER TABLE public.pros
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS subscription_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ghl_contact_id text,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE public.pros
  DROP CONSTRAINT IF EXISTS pros_subscription_status_check;
ALTER TABLE public.pros
  ADD CONSTRAINT pros_subscription_status_check
  CHECK (subscription_status IN ('pending','active','past_due','canceled'));