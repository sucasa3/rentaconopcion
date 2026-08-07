-- 1) Consent records: homeowner keeps ownership, but timestamps/identity are system-controlled.
DROP POLICY IF EXISTS consents_homeowner_all ON public.homeowner_lender_consents;

CREATE POLICY consents_homeowner_select ON public.homeowner_lender_consents
  FOR SELECT TO authenticated USING (homeowner_id = auth.uid());
CREATE POLICY consents_homeowner_insert ON public.homeowner_lender_consents
  FOR INSERT TO authenticated WITH CHECK (homeowner_id = auth.uid());
CREATE POLICY consents_homeowner_delete ON public.homeowner_lender_consents
  FOR DELETE TO authenticated USING (homeowner_id = auth.uid());
CREATE POLICY consents_homeowner_update ON public.homeowner_lender_consents
  FOR UPDATE TO authenticated
  USING (homeowner_id = auth.uid())
  WITH CHECK (homeowner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_guard_consent_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Service role / admin tooling is trusted; only guard end-user sessions.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.granted_at := CASE WHEN NEW.granted_at IS NULL THEN NULL ELSE now() END;
    NEW.revoked_at := CASE WHEN NEW.revoked_at IS NULL THEN NULL ELSE now() END;
    RETURN NEW;
  END IF;

  -- Immutable identity of the consent.
  NEW.homeowner_id  := OLD.homeowner_id;
  NEW.lender_org_id := OLD.lender_org_id;
  NEW.scope         := OLD.scope;

  -- Grant timestamp can only be stamped once, by the server clock.
  IF OLD.granted_at IS NOT NULL THEN
    NEW.granted_at := OLD.granted_at;
  ELSIF NEW.granted_at IS NOT NULL THEN
    NEW.granted_at := now();
  END IF;

  -- Revocation can be set (server clock) or cleared, never back-dated.
  IF NEW.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    NEW.revoked_at := now();
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_consent_change ON public.homeowner_lender_consents;
CREATE TRIGGER trg_guard_consent_change
  BEFORE INSERT OR UPDATE ON public.homeowner_lender_consents
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_consent_change();

-- 2) Linked homeowner records require an active consent with the org.
CREATE OR REPLACE FUNCTION private.has_homeowner_consent(_homeowner_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _homeowner_id IS NULL OR EXISTS (
    SELECT 1 FROM public.homeowner_lender_consents c
    WHERE c.homeowner_id = _homeowner_id
      AND c.lender_org_id = _org_id
      AND c.granted_at IS NOT NULL
      AND c.revoked_at IS NULL
  )
$$;

DROP POLICY IF EXISTS lender_portfolio_clients_member_all ON public.lender_portfolio_clients;

CREATE POLICY lender_portfolio_clients_member_all ON public.lender_portfolio_clients
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lender_portfolios p
      WHERE p.id = lender_portfolio_clients.portfolio_id
        AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR public.has_role(auth.uid(), 'admin'))
        AND (
          public.has_role(auth.uid(), 'admin')
          OR private.has_homeowner_consent(lender_portfolio_clients.homeowner_id, p.lender_org_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lender_portfolios p
      WHERE p.id = lender_portfolio_clients.portfolio_id
        AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR public.has_role(auth.uid(), 'admin'))
        AND (
          public.has_role(auth.uid(), 'admin')
          OR private.has_homeowner_consent(lender_portfolio_clients.homeowner_id, p.lender_org_id)
        )
    )
  );