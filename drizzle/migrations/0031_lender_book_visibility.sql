
CREATE OR REPLACE FUNCTION public.lender_book_visible(_user_id uuid, _org_id uuid, _assigned uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin') THEN true
    WHEN NOT private.is_lender_member(_user_id, _org_id) THEN false
    WHEN (SELECT org_type FROM public.lender_orgs WHERE id = _org_id) IS DISTINCT FROM 'lender' THEN true
    WHEN public.is_lender_manager(_user_id, _org_id) THEN true
    WHEN _assigned = _user_id THEN true
    WHEN _assigned IS NULL AND NOT public.lender_team_enabled(_org_id) THEN true
    ELSE false END
$$;

DROP POLICY IF EXISTS lender_portfolios_member_all ON public.lender_portfolios;
CREATE POLICY lender_portfolios_visible_select ON public.lender_portfolios FOR SELECT TO authenticated
  USING (public.lender_book_visible(auth.uid(), lender_org_id, assigned_user_id));
CREATE POLICY lender_portfolios_visible_update ON public.lender_portfolios FOR UPDATE TO authenticated
  USING (public.lender_book_visible(auth.uid(), lender_org_id, assigned_user_id))
  WITH CHECK (private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY lender_portfolios_visible_delete ON public.lender_portfolios FOR DELETE TO authenticated
  USING (public.lender_book_visible(auth.uid(), lender_org_id, assigned_user_id));
CREATE POLICY lender_portfolios_member_insert ON public.lender_portfolios FOR INSERT TO authenticated
  WITH CHECK (private.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));
