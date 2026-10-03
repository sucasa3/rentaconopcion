CREATE OR REPLACE FUNCTION public.accept_lender_team_invite(_token_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _inv record; _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'SIGN_IN_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO _inv FROM public.lender_team_invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF _inv IS NULL THEN RAISE EXCEPTION 'INVITE_INVALID' USING ERRCODE = 'P0001'; END IF;
  IF _inv.status = 'expired' THEN RAISE EXCEPTION 'INVITE_EXPIRED' USING ERRCODE = 'P0001'; END IF;
  IF _inv.status <> 'pending' THEN RAISE EXCEPTION 'INVITE_CLOSED' USING ERRCODE = 'P0001'; END IF;
  IF _inv.expires_at <= now() THEN
    UPDATE public.lender_team_invitations SET status = 'expired', updated_at = now() WHERE id = _inv.id;
    RETURN NULL;
  END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid;
  IF _email IS DISTINCT FROM lower(_inv.email) THEN RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM public.lender_orgs WHERE id = _inv.lender_org_id FOR UPDATE;
  UPDATE public.lender_team_invitations
     SET status = 'accepted', accepted_by = _uid, accepted_at = now(), updated_at = now()
   WHERE id = _inv.id;
  IF NOT EXISTS (SELECT 1 FROM public.lender_members WHERE lender_org_id = _inv.lender_org_id AND user_id = _uid) THEN
    INSERT INTO public.lender_members (lender_org_id, user_id, role) VALUES (_inv.lender_org_id, _uid, _inv.role);
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'lender') ON CONFLICT DO NOTHING;
  END IF;
  RETURN _inv.lender_org_id;
END $function$;