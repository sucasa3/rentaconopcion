-- 1) Remove PII exposure to merely-offered pros
DROP POLICY IF EXISTS "Pros view only offered or assigned requests" ON public.service_requests;

-- 2) Move SECURITY DEFINER helper functions out of the exposed API schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_lender_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.lender_members WHERE user_id = _user_id AND lender_org_id = _org_id) $$;

CREATE OR REPLACE FUNCTION private.has_lender_access(_org_id uuid, _homeowner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.homeowner_lender_consents
  WHERE lender_org_id = _org_id AND homeowner_id = _homeowner_id
    AND revoked_at IS NULL AND granted_at IS NOT NULL
) $$;

CREATE OR REPLACE FUNCTION private.is_request_homeowner(_request_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.service_requests WHERE id = _request_id AND homeowner_id = _user_id) $$;

REVOKE ALL ON FUNCTION private.is_lender_member(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION private.has_lender_access(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION private.is_request_homeowner(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION private.is_lender_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_lender_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_request_homeowner(uuid, uuid) TO authenticated, service_role;

-- 3) Repoint policies to the private helpers
DROP POLICY IF EXISTS lender_orgs_member_read ON public.lender_orgs;
CREATE POLICY lender_orgs_member_read ON public.lender_orgs FOR SELECT TO authenticated
USING (private.is_lender_member(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS lender_members_self_read ON public.lender_members;
CREATE POLICY lender_members_self_read ON public.lender_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS lender_portfolios_member_all ON public.lender_portfolios;
CREATE POLICY lender_portfolios_member_all ON public.lender_portfolios FOR ALL TO authenticated
USING (private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS lender_portfolio_clients_member_all ON public.lender_portfolio_clients;
CREATE POLICY lender_portfolio_clients_member_all ON public.lender_portfolio_clients FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.lender_portfolios p WHERE p.id = lender_portfolio_clients.portfolio_id
   AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR public.has_role(auth.uid(), 'admin'::app_role))))
WITH CHECK (EXISTS (SELECT 1 FROM public.lender_portfolios p WHERE p.id = lender_portfolio_clients.portfolio_id
   AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

DROP POLICY IF EXISTS consents_lender_read ON public.homeowner_lender_consents;
CREATE POLICY consents_lender_read ON public.homeowner_lender_consents FOR SELECT TO authenticated
USING (private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS lender_activity_member_all ON public.lender_activity;
CREATE POLICY lender_activity_member_all ON public.lender_activity FOR ALL TO authenticated
USING (private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "homeowner sees own assignment" ON public.lead_assignments;
CREATE POLICY "homeowner sees own assignment" ON public.lead_assignments FOR SELECT TO authenticated
USING (private.is_request_homeowner(service_request_id, auth.uid()));

-- 4) Drop the publicly-callable definer helpers
DROP FUNCTION IF EXISTS public.is_lender_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.has_lender_access(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_request_homeowner(uuid, uuid);