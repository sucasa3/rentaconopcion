CREATE OR REPLACE FUNCTION public.enqueue_ghl_sync(_entity_type text, _entity_id uuid, _op text DEFAULT 'upsert'::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _entity_type = 'homeowner' AND EXISTS (
       SELECT 1 FROM public.profiles p WHERE p.id = _entity_id AND p.is_test_account) THEN
    RETURN;
  END IF;
  INSERT INTO public.ghl_sync_queue (entity_type, entity_id, op) VALUES (_entity_type, _entity_id, _op)
  ON CONFLICT (entity_type, entity_id) WHERE processed_at IS NULL
  DO UPDATE SET op = EXCLUDED.op, updated_at = now();
END $function$;