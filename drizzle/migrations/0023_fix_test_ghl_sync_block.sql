CREATE OR REPLACE FUNCTION public.tg_block_test_ghl_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.processed_at IS NULL AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.is_test_account AND p.id = NEW.entity_id) THEN
    NEW.processed_at := now();
    NEW.last_error := 'skipped: test account';
  END IF;
  RETURN NEW;
END $$;