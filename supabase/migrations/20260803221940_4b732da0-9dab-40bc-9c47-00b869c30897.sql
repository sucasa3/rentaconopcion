-- Collapse existing pending duplicates, keeping the oldest per entity
DELETE FROM public.ghl_sync_queue q
USING public.ghl_sync_queue keep
WHERE q.processed_at IS NULL
  AND keep.processed_at IS NULL
  AND q.entity_type = keep.entity_type
  AND q.entity_id = keep.entity_id
  AND (q.created_at > keep.created_at OR (q.created_at = keep.created_at AND q.id > keep.id));

CREATE UNIQUE INDEX IF NOT EXISTS ghl_sync_queue_pending_uniq
  ON public.ghl_sync_queue (entity_type, entity_id)
  WHERE processed_at IS NULL;

CREATE OR REPLACE FUNCTION public.enqueue_ghl_sync(_entity_type text, _entity_id uuid, _op text DEFAULT 'upsert'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ghl_sync_queue (entity_type, entity_id, op)
  VALUES (_entity_type, _entity_id, _op)
  ON CONFLICT (entity_type, entity_id) WHERE processed_at IS NULL
  DO UPDATE SET op = EXCLUDED.op, updated_at = now();
END;
$function$;