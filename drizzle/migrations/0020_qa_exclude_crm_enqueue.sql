CREATE OR REPLACE FUNCTION public.enqueue_ghl_sync(_entity_type text, _entity_id uuid, _op text DEFAULT 'upsert')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Labeled QA accounts never reach the CRM, whichever trigger asks.
  IF _entity_type = 'homeowner' AND EXISTS (
       SELECT 1 FROM public.profiles p WHERE p.id = _entity_id AND p.is_test_account) THEN
    RETURN;
  END IF;
  INSERT INTO public.ghl_sync_queue (entity_type, entity_id, op) VALUES (_entity_type, _entity_id, _op);
END $$;

UPDATE public.ghl_sync_queue q SET processed_at = now(), last_error = 'excluded: test account'
  WHERE q.processed_at IS NULL AND q.entity_type = 'homeowner'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = q.entity_id AND p.is_test_account);