CREATE OR REPLACE FUNCTION public.tg_claim_activation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Only the homeowner's own completed maintenance entry counts; professional entries never activate.
  IF COALESCE(NEW.entered_by_role, 'homeowner') <> 'homeowner'
     OR (NEW.entered_by_user_id IS NOT NULL AND NEW.entered_by_user_id <> NEW.user_id)
     OR NEW.action NOT IN ('serviced','replaced')
     OR (NEW.serviced_on IS NOT NULL AND NEW.serviced_on > current_date) THEN
    RETURN NEW;
  END IF;
  UPDATE public.homeowner_claim_invites
     SET activated_at = now()
   WHERE claimed_by = NEW.user_id AND claimed_at IS NOT NULL
     AND home_confirmed_at IS NOT NULL AND home_corrected = false AND activated_at IS NULL;
  RETURN NEW;
END $function$;