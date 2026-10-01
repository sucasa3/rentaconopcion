ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;
ALTER TABLE public.lender_orgs ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

-- Backfill labeled QA fixtures (TEST-SYNTHETIC accounts and orgs).
UPDATE public.profiles p SET is_test_account = true
  FROM auth.users u
  WHERE u.id = p.id AND (u.email ILIKE 'test-synthetic%' OR u.raw_app_meta_data ? 'sucasa_qa_fixture' OR u.raw_app_meta_data ? 'sucasa_verify_only');
UPDATE public.lender_orgs SET is_test_account = true WHERE name ILIKE '%TEST-SYNTHETIC%';

-- Mark new QA fixture profiles automatically.
CREATE OR REPLACE FUNCTION public.tg_mark_test_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id AND
     (u.email ILIKE 'test-synthetic%' OR u.raw_app_meta_data ? 'sucasa_qa_fixture' OR u.raw_app_meta_data ? 'sucasa_verify_only')) THEN
    NEW.is_test_account := true;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_mark_test_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_profiles_mark_test ON public.profiles;
CREATE TRIGGER trg_profiles_mark_test BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_mark_test_profile();

CREATE OR REPLACE FUNCTION public.tg_mark_test_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name ILIKE '%TEST-SYNTHETIC%' THEN NEW.is_test_account := true; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_mark_test_org() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_lender_orgs_mark_test ON public.lender_orgs;
CREATE TRIGGER trg_lender_orgs_mark_test BEFORE INSERT OR UPDATE OF name ON public.lender_orgs
  FOR EACH ROW EXECUTE FUNCTION public.tg_mark_test_org();

-- Never queue test homeowners for CRM sync.
CREATE OR REPLACE FUNCTION public.tg_enqueue_profile_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_test_account THEN RETURN NEW; END IF;
  PERFORM public.enqueue_ghl_sync('homeowner', NEW.id, 'upsert');
  RETURN NEW;
END $$;

-- Retire already-queued test jobs (not deleted, just closed).
UPDATE public.ghl_sync_queue q SET processed_at = now(), last_error = 'excluded: test account'
  WHERE q.processed_at IS NULL AND q.entity_type = 'homeowner'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = q.entity_id AND p.is_test_account);