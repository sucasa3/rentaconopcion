CREATE OR REPLACE FUNCTION public.tg_refresh_lifecycle_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_new public.lifecycle_stage;
  v_old public.lifecycle_stage;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    v_user_id := (to_jsonb(NEW) ->> 'id')::uuid;
  ELSIF TG_TABLE_NAME = 'service_requests' THEN
    v_user_id := (to_jsonb(NEW) ->> 'homeowner_id')::uuid;
  END IF;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT lifecycle_stage INTO v_old FROM public.profiles WHERE id = v_user_id;
  v_new := public.compute_lifecycle_stage(v_user_id);

  UPDATE public.profiles
    SET lifecycle_stage = v_new,
        last_activity_at = now()
    WHERE id = v_user_id;

  IF v_new IS DISTINCT FROM v_old THEN
    PERFORM public.enqueue_ghl_sync('homeowner', v_user_id, 'upsert');
  END IF;
  RETURN NEW;
END; $function$;