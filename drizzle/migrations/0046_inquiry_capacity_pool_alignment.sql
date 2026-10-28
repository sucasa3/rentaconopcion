CREATE OR REPLACE FUNCTION public.inquiry_profile_slot_available(p_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT greatest(public.org_active_profile_count(p_org),coalesce(o.reserved_profiles,0)) + coalesce((SELECT sum(s.credits_granted) FROM public.sponsored_agent_seats s WHERE s.sponsor_org_id=p_org AND s.status <> 'ended'),0) < coalesce(public.org_profile_capacity(p_org),0) FROM public.lender_orgs o WHERE o.id=p_org
$$;
REVOKE ALL ON FUNCTION public.inquiry_profile_slot_available(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inquiry_profile_slot_available(uuid) TO service_role;
DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.record_homeowner_lending_inquiry(uuid,uuid,text,text,text,boolean,jsonb,text,text)'::regprocedure) INTO definition;
definition := replace(definition,'pending := public.org_active_profile_count(d.lender_org_id) + allocated >= coalesce(public.org_profile_capacity(d.lender_org_id),0);','pending := NOT coalesce(public.inquiry_profile_slot_available(d.lender_org_id),false);');
EXECUTE definition;
END $$;