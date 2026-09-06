-- 1) Restrict Stripe identifier columns on lender_orgs to service_role only.
REVOKE SELECT ON public.lender_orgs FROM authenticated;
GRANT SELECT (
  id, name, license_number, primary_contact_email, plan, active,
  created_at, updated_at, org_type, sender_name, reply_to_email,
  contact_name, contact_title, contact_phone, logo_url, signoff,
  seat_limit, plan_key, sponsored_allocation, subscription_status,
  current_period_end, profile_allowance, activated_at, reserved_profiles,
  commitment_ends_at, pending_plan_key, pending_plan_effective_at
) ON public.lender_orgs TO authenticated;

-- 2) Replace the combined ALL policy on lender_portfolio_clients with per-command policies.
DROP POLICY lender_portfolio_clients_member_all ON public.lender_portfolio_clients;

CREATE POLICY lender_portfolio_clients_member_select
ON public.lender_portfolio_clients
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM lender_portfolios p
  WHERE p.id = lender_portfolio_clients.portfolio_id
    AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR has_role(auth.uid(), 'admin'::app_role))
    AND (has_role(auth.uid(), 'admin'::app_role) OR private.has_homeowner_consent(lender_portfolio_clients.homeowner_id, p.lender_org_id))
));

-- INSERT requires consent to exist at creation time (WITH CHECK only).
CREATE POLICY lender_portfolio_clients_member_insert
ON public.lender_portfolio_clients
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM lender_portfolios p
  WHERE p.id = lender_portfolio_clients.portfolio_id
    AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR has_role(auth.uid(), 'admin'::app_role))
    AND (has_role(auth.uid(), 'admin'::app_role) OR private.has_homeowner_consent(lender_portfolio_clients.homeowner_id, p.lender_org_id))
));

CREATE POLICY lender_portfolio_clients_member_update
ON public.lender_portfolio_clients
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM lender_portfolios p
  WHERE p.id = lender_portfolio_clients.portfolio_id
    AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR has_role(auth.uid(), 'admin'::app_role))
    AND (has_role(auth.uid(), 'admin'::app_role) OR private.has_homeowner_consent(lender_portfolio_clients.homeowner_id, p.lender_org_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM lender_portfolios p
  WHERE p.id = lender_portfolio_clients.portfolio_id
    AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR has_role(auth.uid(), 'admin'::app_role))
    AND (has_role(auth.uid(), 'admin'::app_role) OR private.has_homeowner_consent(lender_portfolio_clients.homeowner_id, p.lender_org_id))
));

-- DELETE is explicitly scoped to org members/admins only.
CREATE POLICY lender_portfolio_clients_member_delete
ON public.lender_portfolio_clients
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM lender_portfolios p
  WHERE p.id = lender_portfolio_clients.portfolio_id
    AND (private.is_lender_member(auth.uid(), p.lender_org_id) OR has_role(auth.uid(), 'admin'::app_role))
    AND (has_role(auth.uid(), 'admin'::app_role) OR private.has_homeowner_consent(lender_portfolio_clients.homeowner_id, p.lender_org_id))
));