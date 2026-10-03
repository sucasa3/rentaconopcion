
-- 1. Explicit team entitlement on plans
ALTER TABLE public.plan_tiers ADD COLUMN IF NOT EXISTS team_enabled boolean NOT NULL DEFAULT false;
UPDATE public.plan_tiers SET team_enabled = true
 WHERE key IN ('branch','branch_pro_v2','network','branch_growth','branch_pro','enterprise');

-- 2. Downgrade retention selection
ALTER TABLE public.lender_orgs ADD COLUMN IF NOT EXISTS retained_member_ids uuid[];

-- 3. Collaboration ownership
ALTER TABLE public.agent_lender_connections ADD COLUMN IF NOT EXISTS owner_user_id uuid;
UPDATE public.agent_lender_connections c
   SET owner_user_id = COALESCE(
     (SELECT m.user_id FROM public.lender_members m WHERE m.lender_org_id = c.lender_org_id AND m.user_id = c.invited_by),
     (SELECT m.user_id FROM public.lender_members m WHERE m.lender_org_id = c.lender_org_id
        ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at, m.user_id LIMIT 1))
 WHERE owner_user_id IS NULL;

-- 4. Team invitations
CREATE TABLE public.lender_team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','manager')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','canceled','expired')),
  invited_by uuid NOT NULL,
  accepted_by uuid,
  accepted_at timestamptz,
  canceled_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lender_team_invitations_one_pending
  ON public.lender_team_invitations (lender_org_id, lower(email)) WHERE status = 'pending';
GRANT SELECT ON public.lender_team_invitations TO authenticated;
GRANT ALL ON public.lender_team_invitations TO service_role;
ALTER TABLE public.lender_team_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY lti_manager_read ON public.lender_team_invitations FOR SELECT TO authenticated
  USING (public.is_lender_manager(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));

-- 5. Suspended members (data preserved; access removed)
CREATE TABLE public.lender_suspended_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  member_since timestamptz,
  reason text NOT NULL DEFAULT 'downgrade',
  suspended_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lender_org_id, user_id)
);
GRANT SELECT ON public.lender_suspended_members TO authenticated;
GRANT ALL ON public.lender_suspended_members TO service_role;
ALTER TABLE public.lender_suspended_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY lsm_read ON public.lender_suspended_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_lender_manager(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));

-- 6. Helpers
CREATE OR REPLACE FUNCTION public.lender_team_enabled(_org_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT pt.team_enabled FROM public.lender_orgs o
     JOIN public.plan_tiers pt ON pt.key = o.plan_key WHERE o.id = _org_id), false)
$$;

CREATE OR REPLACE FUNCTION public.lender_is_team_manager(_user_id uuid, _org_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR (public.is_lender_manager(_user_id, _org_id) AND public.lender_team_enabled(_org_id))
$$;

CREATE OR REPLACE FUNCTION public.lender_seat_limit(_org_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(o.seat_limit, pt.seat_limit, 1)
    FROM public.lender_orgs o LEFT JOIN public.plan_tiers pt ON pt.key = o.plan_key
   WHERE o.id = _org_id
$$;

-- Seats used = active members + pending, unexpired invitations.
CREATE OR REPLACE FUNCTION public.lender_seat_usage(_org_id uuid)
RETURNS TABLE(active_members integer, pending_invites integer, seat_limit integer, team_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::int FROM public.lender_members WHERE lender_org_id = _org_id),
    (SELECT count(*)::int FROM public.lender_team_invitations
      WHERE lender_org_id = _org_id AND status = 'pending' AND expires_at > now()),
    public.lender_seat_limit(_org_id),
    public.lender_team_enabled(_org_id)
$$;

-- 7. Enforce capacity on EVERY lender membership write
CREATE OR REPLACE FUNCTION public.tg_enforce_lender_seats() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _type text; _limit int; _active int; _pending int; _email text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.lender_org_id = OLD.lender_org_id THEN RETURN NEW; END IF;
  SELECT org_type INTO _type FROM public.lender_orgs WHERE id = NEW.lender_org_id FOR UPDATE;
  IF _type IS DISTINCT FROM 'lender' THEN RETURN NEW; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = NEW.user_id;
  _limit := public.lender_seat_limit(NEW.lender_org_id);
  SELECT count(*) INTO _active FROM public.lender_members
   WHERE lender_org_id = NEW.lender_org_id AND user_id <> NEW.user_id;
  -- The joining person's own reservation is not counted twice.
  SELECT count(*) INTO _pending FROM public.lender_team_invitations
   WHERE lender_org_id = NEW.lender_org_id AND status = 'pending' AND expires_at > now()
     AND lower(email) IS DISTINCT FROM _email;
  IF _active + _pending >= _limit THEN
    RAISE EXCEPTION 'SEAT_LIMIT_REACHED: this plan includes % seat(s)', _limit USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_lender_member_consume_invite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = NEW.user_id;
  UPDATE public.lender_team_invitations
     SET status = 'accepted', accepted_by = NEW.user_id, accepted_at = now(), updated_at = now()
   WHERE lender_org_id = NEW.lender_org_id AND status = 'pending' AND lower(email) = _email;
  DELETE FROM public.lender_suspended_members
   WHERE lender_org_id = NEW.lender_org_id AND user_id = NEW.user_id;
  RETURN NEW;
END $$;

CREATE TRIGGER lender_members_enforce_seats
  BEFORE INSERT OR UPDATE OF lender_org_id ON public.lender_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_lender_seats();
CREATE TRIGGER lender_members_consume_invite
  AFTER INSERT ON public.lender_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_lender_member_consume_invite();

-- 8. Invitation lifecycle (all checks under an org row lock)
CREATE OR REPLACE FUNCTION public.create_lender_team_invite(_org_id uuid, _email text, _role text, _token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _active int; _pending int; _limit int; _e text := lower(trim(_email));
BEGIN
  IF _uid IS NULL OR NOT public.lender_is_team_manager(_uid, _org_id) THEN
    RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF _role NOT IN ('member','manager') THEN RAISE EXCEPTION 'BAD_ROLE'; END IF;
  PERFORM 1 FROM public.lender_orgs WHERE id = _org_id FOR UPDATE;
  UPDATE public.lender_team_invitations SET status = 'expired', updated_at = now()
   WHERE lender_org_id = _org_id AND status = 'pending' AND expires_at <= now();
  IF EXISTS (SELECT 1 FROM public.lender_members m JOIN auth.users u ON u.id = m.user_id
              WHERE m.lender_org_id = _org_id AND lower(u.email) = _e) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lender_team_invitations
              WHERE lender_org_id = _org_id AND status = 'pending' AND lower(email) = _e) THEN
    RAISE EXCEPTION 'INVITE_PENDING' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO _active FROM public.lender_members WHERE lender_org_id = _org_id;
  SELECT count(*) INTO _pending FROM public.lender_team_invitations WHERE lender_org_id = _org_id AND status = 'pending';
  _limit := public.lender_seat_limit(_org_id);
  IF _active + _pending >= _limit THEN
    RAISE EXCEPTION 'SEAT_LIMIT_REACHED: this plan includes % seat(s)', _limit USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.lender_team_invitations (lender_org_id, email, role, token_hash, invited_by)
  VALUES (_org_id, _e, _role, _token_hash, _uid) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.resend_lender_team_invite(_invite_id uuid, _token_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _inv record; _active int; _pending int;
BEGIN
  SELECT * INTO _inv FROM public.lender_team_invitations WHERE id = _invite_id FOR UPDATE;
  IF _inv IS NULL OR _uid IS NULL OR NOT public.lender_is_team_manager(_uid, _inv.lender_org_id) THEN
    RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF _inv.status NOT IN ('pending','expired') THEN RAISE EXCEPTION 'INVITE_CLOSED' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM public.lender_orgs WHERE id = _inv.lender_org_id FOR UPDATE;
  IF _inv.status = 'expired' OR _inv.expires_at <= now() THEN
    SELECT count(*) INTO _active FROM public.lender_members WHERE lender_org_id = _inv.lender_org_id;
    SELECT count(*) INTO _pending FROM public.lender_team_invitations
     WHERE lender_org_id = _inv.lender_org_id AND status = 'pending' AND expires_at > now() AND id <> _inv.id;
    IF _active + _pending >= public.lender_seat_limit(_inv.lender_org_id) THEN
      RAISE EXCEPTION 'SEAT_LIMIT_REACHED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  UPDATE public.lender_team_invitations
     SET token_hash = _token_hash, status = 'pending', expires_at = now() + interval '7 days', updated_at = now()
   WHERE id = _invite_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_lender_team_invite(_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _org uuid;
BEGIN
  SELECT lender_org_id INTO _org FROM public.lender_team_invitations WHERE id = _invite_id FOR UPDATE;
  IF _org IS NULL OR _uid IS NULL OR NOT public.is_lender_manager(_uid, _org) AND NOT public.has_role(_uid,'admin') THEN
    RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.lender_team_invitations SET status = 'canceled', canceled_at = now(), updated_at = now()
   WHERE id = _invite_id AND status IN ('pending','expired');
END $$;

-- Accept: the reservation becomes the membership in one transaction.
CREATE OR REPLACE FUNCTION public.accept_lender_team_invite(_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _inv record; _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'SIGN_IN_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO _inv FROM public.lender_team_invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF _inv IS NULL THEN RAISE EXCEPTION 'INVITE_INVALID' USING ERRCODE = 'P0001'; END IF;
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
END $$;

-- 9. Member management
CREATE OR REPLACE FUNCTION public.remove_lender_member(_org_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _role text;
BEGIN
  IF _uid IS NULL OR NOT public.lender_is_team_manager(_uid, _org_id) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = 'P0001'; END IF;
  SELECT role INTO _role FROM public.lender_members WHERE lender_org_id = _org_id AND user_id = _user_id;
  IF _role IS NULL THEN RAISE EXCEPTION 'NOT_A_MEMBER' USING ERRCODE = 'P0001'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'CANNOT_REMOVE_OWNER' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.lender_suspended_members (lender_org_id, user_id, role, member_since, reason)
  SELECT lender_org_id, user_id, role, created_at, 'removed' FROM public.lender_members
   WHERE lender_org_id = _org_id AND user_id = _user_id
  ON CONFLICT (lender_org_id, user_id) DO UPDATE SET reason = 'removed', suspended_at = now();
  DELETE FROM public.lender_members WHERE lender_org_id = _org_id AND user_id = _user_id;
END $$;

-- Reactivation is manual and capacity-checked by the seat trigger.
CREATE OR REPLACE FUNCTION public.reactivate_lender_member(_org_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _s record;
BEGIN
  IF _uid IS NULL OR NOT public.lender_is_team_manager(_uid, _org_id) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO _s FROM public.lender_suspended_members WHERE lender_org_id = _org_id AND user_id = _user_id FOR UPDATE;
  IF _s IS NULL THEN RAISE EXCEPTION 'NOT_SUSPENDED' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.lender_members (lender_org_id, user_id, role)
  VALUES (_org_id, _user_id, CASE WHEN _s.role = 'owner' THEN 'manager' ELSE _s.role END);
END $$;

CREATE OR REPLACE FUNCTION public.set_lender_retained_members(_org_id uuid, _user_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT (public.is_lender_manager(_uid, _org_id) OR public.has_role(_uid,'admin')) THEN
    RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.lender_orgs SET retained_member_ids = (
    SELECT array_agg(x ORDER BY ord) FROM unnest(_user_ids) WITH ORDINALITY AS t(x, ord)
     WHERE EXISTS (SELECT 1 FROM public.lender_members m WHERE m.lender_org_id = _org_id AND m.user_id = t.x))
  WHERE id = _org_id;
END $$;

-- Apply the org's current seat allowance. Retention order:
--   1) owner(s)  2) manager-selected members, in selection order
--   3) remaining by role (manager/admin before member), then join date, then user id.
-- Excess members move to lender_suspended_members (books, history and assignments kept).
CREATE OR REPLACE FUNCTION public.apply_lender_seat_allowance(_org_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit int; _ret uuid[]; _suspended int := 0; _active int; _pending int; _inv record;
BEGIN
  PERFORM 1 FROM public.lender_orgs WHERE id = _org_id AND org_type = 'lender' FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  _limit := public.lender_seat_limit(_org_id);
  SELECT COALESCE(retained_member_ids, '{}') INTO _ret FROM public.lender_orgs WHERE id = _org_id;
  WITH ranked AS (
    SELECT m.*, row_number() OVER (ORDER BY
      CASE WHEN m.role = 'owner' THEN 0 WHEN m.user_id = ANY(_ret) THEN 1 ELSE 2 END,
      COALESCE(array_position(_ret, m.user_id), 2147483647),
      CASE WHEN m.role IN ('manager','admin') THEN 0 ELSE 1 END,
      m.created_at, m.user_id) AS rn
    FROM public.lender_members m WHERE m.lender_org_id = _org_id
  ), excess AS (
    SELECT * FROM ranked WHERE rn > GREATEST(_limit, 1) AND role <> 'owner'
  ), ins AS (
    INSERT INTO public.lender_suspended_members (lender_org_id, user_id, role, member_since, reason)
    SELECT lender_org_id, user_id, role, created_at, 'downgrade' FROM excess
    ON CONFLICT (lender_org_id, user_id) DO UPDATE SET reason = 'downgrade', suspended_at = now()
    RETURNING user_id
  )
  DELETE FROM public.lender_members d USING ins
   WHERE d.lender_org_id = _org_id AND d.user_id = ins.user_id;
  GET DIAGNOSTICS _suspended = ROW_COUNT;
  -- Release pending reservations beyond the allowance, newest first.
  SELECT count(*) INTO _active FROM public.lender_members WHERE lender_org_id = _org_id;
  FOR _inv IN SELECT id FROM public.lender_team_invitations
               WHERE lender_org_id = _org_id AND status = 'pending' ORDER BY created_at DESC LOOP
    SELECT count(*) INTO _pending FROM public.lender_team_invitations WHERE lender_org_id = _org_id AND status = 'pending';
    EXIT WHEN _active + _pending <= _limit;
    UPDATE public.lender_team_invitations SET status = 'canceled', canceled_at = now(), updated_at = now() WHERE id = _inv.id;
  END LOOP;
  RETURN _suspended;
END $$;
REVOKE EXECUTE ON FUNCTION public.apply_lender_seat_allowance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lender_seat_allowance(uuid) TO service_role;

-- 10. Collaboration ownership guard (lender side)
CREATE OR REPLACE FUNCTION public.tg_guard_collab_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _lender_side boolean; _agent_side boolean;
BEGIN
  IF _uid IS NULL OR public.has_role(_uid, 'admin') THEN
    IF TG_OP = 'INSERT' AND NEW.owner_user_id IS NULL THEN NEW.owner_user_id := NEW.invited_by; END IF;
    RETURN NEW;
  END IF;
  _lender_side := EXISTS (SELECT 1 FROM public.lender_members WHERE lender_org_id = NEW.lender_org_id AND user_id = _uid);
  _agent_side := NEW.agent_org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.lender_members WHERE lender_org_id = NEW.agent_org_id AND user_id = _uid);
  IF TG_OP = 'INSERT' THEN
    IF _lender_side AND (NEW.owner_user_id IS NULL OR (NEW.owner_user_id <> _uid AND NOT public.lender_is_team_manager(_uid, NEW.lender_org_id))) THEN
      NEW.owner_user_id := _uid;
    END IF;
    RETURN NEW;
  END IF;
  IF _agent_side AND NOT _lender_side THEN
    NEW.owner_user_id := OLD.owner_user_id; RETURN NEW;
  END IF;
  IF _lender_side AND NOT public.lender_is_team_manager(_uid, NEW.lender_org_id) THEN
    IF OLD.owner_user_id IS NOT NULL AND OLD.owner_user_id <> _uid THEN
      RAISE EXCEPTION 'COLLAB_FORBIDDEN: owned by another loan officer' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
      RAISE EXCEPTION 'COLLAB_FORBIDDEN: only a branch manager can reassign' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_lender_connections_owner_guard
  BEFORE INSERT OR UPDATE ON public.agent_lender_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_collab_owner();
