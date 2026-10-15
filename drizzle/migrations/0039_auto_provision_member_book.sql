CREATE OR REPLACE FUNCTION public.tg_provision_member_book()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  IF EXISTS (SELECT 1 FROM lender_portfolios WHERE assigned_user_id = NEW.user_id) THEN RETURN NEW; END IF;
  -- Owners of a workspace that already has a shared (unassigned) book keep using it.
  IF NEW.role = 'owner' AND EXISTS (SELECT 1 FROM lender_portfolios WHERE lender_org_id = NEW.lender_org_id AND assigned_user_id IS NULL) THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(full_name,''), NULLIF(email,''), 'My') INTO _name FROM profiles WHERE id = NEW.user_id;
  INSERT INTO lender_portfolios (lender_org_id, name, assigned_user_id)
  VALUES (NEW.lender_org_id, COALESCE(_name,'My') || ' — clients', NEW.user_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS provision_member_book ON public.lender_members;
CREATE TRIGGER provision_member_book AFTER INSERT ON public.lender_members
FOR EACH ROW EXECUTE FUNCTION public.tg_provision_member_book();

INSERT INTO public.lender_portfolios (lender_org_id, name, assigned_user_id)
SELECT m.lender_org_id, COALESCE(NULLIF(p.full_name,''), NULLIF(p.email,''), 'My') || ' — clients', m.user_id
FROM public.lender_members m LEFT JOIN public.profiles p ON p.id = m.user_id
WHERE m.role <> 'owner'
  AND NOT EXISTS (SELECT 1 FROM public.lender_portfolios lp WHERE lp.assigned_user_id = m.user_id)
  AND m.user_id = (SELECT m2.user_id FROM public.lender_members m2 WHERE m2.user_id = m.user_id ORDER BY m2.created_at LIMIT 1)
ON CONFLICT DO NOTHING;