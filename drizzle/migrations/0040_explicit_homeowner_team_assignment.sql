CREATE OR REPLACE FUNCTION public.assign_homeowners_to_member(p_source uuid, p_client_ids uuid[], p_target_user uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_org uuid; v_target uuid; v_count integer; v_locked integer;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT lender_org_id INTO v_org FROM public.lender_portfolios WHERE id=p_source;
 IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.lender_members WHERE lender_org_id=v_org AND user_id=v_actor AND role IN ('owner','admin','manager')) OR NOT public.lender_team_enabled(v_org) OR NOT EXISTS(SELECT 1 FROM public.lender_orgs WHERE id=v_org AND org_type='lender') THEN RAISE EXCEPTION 'Branch manager access required'; END IF;
 PERFORM 1 FROM public.lender_orgs WHERE id=v_org FOR UPDATE;
 PERFORM 1 FROM public.lender_members WHERE lender_org_id=v_org AND user_id=p_target_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active member of this branch'; END IF;
 SELECT id INTO v_target FROM public.lender_portfolios WHERE lender_org_id=v_org AND assigned_user_id=p_target_user ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF v_target IS NULL THEN RAISE EXCEPTION 'This member has no personal client book'; END IF;
 IF p_client_ids IS NULL OR cardinality(p_client_ids)=0 OR cardinality(p_client_ids)>500 THEN RAISE EXCEPTION 'Select between 1 and 500 homeowners'; END IF;
 SELECT count(DISTINCT x) INTO v_count FROM unnest(p_client_ids) x;
 PERFORM 1 FROM public.lender_portfolio_clients WHERE id=ANY(p_client_ids) AND portfolio_id=p_source FOR UPDATE;
 GET DIAGNOSTICS v_locked = ROW_COUNT;
 IF v_locked<>v_count THEN RAISE EXCEPTION 'Selection changed; refresh your book and try again'; END IF;
 IF v_target=p_source THEN RETURN jsonb_build_object('assigned',0,'targetPortfolioId',v_target); END IF;
 IF EXISTS (SELECT 1 FROM public.lender_portfolio_clients s JOIN public.lender_portfolio_clients t ON t.portfolio_id=v_target AND ((s.homeowner_id IS NOT NULL AND s.homeowner_id=t.homeowner_id) OR (s.client_email IS NOT NULL AND lower(trim(s.client_email))=lower(trim(t.client_email))) OR (regexp_replace(lower(s.address_line1),'[^a-z0-9]','','g')=regexp_replace(lower(t.address_line1),'[^a-z0-9]','','g') AND coalesce(left(s.zip,5),'')=coalesce(left(t.zip,5),''))) WHERE s.id=ANY(p_client_ids) AND s.portfolio_id=p_source) THEN RAISE EXCEPTION 'A selected homeowner is already in the destination book. Nothing was moved.'; END IF;
 UPDATE public.lender_portfolio_clients SET portfolio_id=v_target WHERE id=ANY(p_client_ids) AND portfolio_id=p_source;
 UPDATE public.property_enrichment_queue SET portfolio_id=v_target WHERE portfolio_client_id=ANY(p_client_ids);
 INSERT INTO public.lender_activity(lender_org_id,portfolio_client_id,actor_user_id,action,detail) SELECT v_org,x,v_actor,'homeowner_assigned',jsonb_build_object('from',p_source,'to',v_target,'assigned_user_id',p_target_user)::text FROM unnest(p_client_ids) x GROUP BY x;
 RETURN jsonb_build_object('assigned',v_count,'targetPortfolioId',v_target);
END $$;
REVOKE ALL ON FUNCTION public.assign_homeowners_to_member(uuid,uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_homeowners_to_member(uuid,uuid[],uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_personal_homeowner_intake() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_owner uuid; v_org uuid;
BEGIN
 IF v_actor IS NULL THEN RETURN NEW; END IF;
 SELECT assigned_user_id,lender_org_id INTO v_owner,v_org FROM public.lender_portfolios WHERE id=NEW.portfolio_id;
 IF TG_OP='INSERT' THEN
   IF v_owner IS DISTINCT FROM v_actor OR NOT EXISTS(SELECT 1 FROM public.lender_members WHERE lender_org_id=v_org AND user_id=v_actor) THEN RAISE EXCEPTION 'Uploads belong to your own personal book'; END IF;
 ELSIF NEW.portfolio_id IS DISTINCT FROM OLD.portfolio_id THEN
   IF NOT EXISTS(SELECT 1 FROM public.lender_portfolios p JOIN public.lender_members m ON m.lender_org_id=p.lender_org_id WHERE p.id=OLD.portfolio_id AND p.lender_org_id=v_org AND m.user_id=v_actor AND m.role IN ('owner','admin','manager')) OR NOT public.lender_team_enabled(v_org) OR NOT EXISTS(SELECT 1 FROM public.lender_members WHERE lender_org_id=v_org AND user_id=v_owner) THEN RAISE EXCEPTION 'Only branch managers may assign to active team members'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_personal_homeowner_intake BEFORE INSERT OR UPDATE OF portfolio_id ON public.lender_portfolio_clients FOR EACH ROW EXECUTE FUNCTION public.guard_personal_homeowner_intake();