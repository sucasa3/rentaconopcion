
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.lifecycle_stage AS ENUM (
    'new_signup','onboarding','active_homeowner','needs_reengagement','premium_member','inactive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Profiles columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_stage public.lifecycle_stage NOT NULL DEFAULT 'new_signup',
  ADD COLUMN IF NOT EXISTS ghl_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Update handle_new_user to capture email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'homeowner') ON CONFLICT DO NOTHING;
  -- Enqueue initial GHL sync
  INSERT INTO public.ghl_sync_queue (entity_type, entity_id, op)
    VALUES ('homeowner', NEW.id, 'upsert');
  RETURN NEW;
END; $$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Compute lifecycle stage
CREATE OR REPLACE FUNCTION public.compute_lifecycle_stage(_user_id uuid)
RETURNS public.lifecycle_stage
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current public.lifecycle_stage;
  v_profile_complete boolean;
  v_has_service boolean;
BEGIN
  SELECT lifecycle_stage,
         (address IS NOT NULL AND city IS NOT NULL AND full_name <> '')
    INTO v_current, v_profile_complete
    FROM public.profiles WHERE id = _user_id;

  -- Terminal / manual stages are preserved
  IF v_current IN ('premium_member','inactive') THEN
    RETURN v_current;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.service_requests WHERE homeowner_id = _user_id)
    INTO v_has_service;

  IF v_profile_complete AND v_has_service THEN
    RETURN 'active_homeowner';
  ELSIF v_profile_complete OR v_has_service THEN
    RETURN 'onboarding';
  ELSE
    RETURN COALESCE(v_current, 'new_signup');
  END IF;
END; $$;

-- 5. Trigger: recompute stage on profile / service_request changes
CREATE OR REPLACE FUNCTION public.tg_refresh_lifecycle_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_new public.lifecycle_stage;
  v_old public.lifecycle_stage;
BEGIN
  v_user_id := CASE TG_TABLE_NAME
    WHEN 'profiles' THEN NEW.id
    WHEN 'service_requests' THEN NEW.homeowner_id
  END;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT lifecycle_stage INTO v_old FROM public.profiles WHERE id = v_user_id;
  v_new := public.compute_lifecycle_stage(v_user_id);

  UPDATE public.profiles
    SET lifecycle_stage = v_new,
        last_activity_at = now()
    WHERE id = v_user_id;

  IF v_new IS DISTINCT FROM v_old THEN
    INSERT INTO public.ghl_sync_queue (entity_type, entity_id, op)
      VALUES ('homeowner', v_user_id, 'upsert');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tg_profile_lifecycle ON public.profiles;
CREATE TRIGGER tg_profile_lifecycle
  AFTER UPDATE OF address, city, full_name, phone, zip ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_lifecycle_stage();

DROP TRIGGER IF EXISTS tg_service_request_lifecycle ON public.service_requests;
CREATE TRIGGER tg_service_request_lifecycle
  AFTER INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_lifecycle_stage();

-- 6. Backfill existing profiles
UPDATE public.profiles p
  SET lifecycle_stage = public.compute_lifecycle_stage(p.id);

-- Enqueue every existing homeowner for initial GHL sync
INSERT INTO public.ghl_sync_queue (entity_type, entity_id, op)
  SELECT 'homeowner', id, 'upsert' FROM public.profiles;

-- Backfill emails from auth.users where missing
UPDATE public.profiles p SET email = u.email
  FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;
