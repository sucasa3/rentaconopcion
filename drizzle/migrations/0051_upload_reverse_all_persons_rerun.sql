ALTER TABLE public.upload_reverse_searches
  ADD COLUMN owner_filter text NOT NULL DEFAULT 'owners_only' CHECK (owner_filter IN ('owners_only','all_persons')),
  ADD COLUMN rerun_of uuid UNIQUE REFERENCES public.upload_reverse_searches(id);
ALTER TABLE public.upload_reverse_searches DROP CONSTRAINT upload_reverse_searches_staged_id_key;
CREATE UNIQUE INDEX upload_reverse_staged_filter_once ON public.upload_reverse_searches(staged_id, owner_filter);
DROP INDEX public.upload_reverse_phone_once;
DROP INDEX public.upload_reverse_email_once;
CREATE UNIQUE INDEX upload_reverse_phone_once ON public.upload_reverse_searches(book_id, input_phone, owner_filter) WHERE input_phone IS NOT NULL;
CREATE UNIQUE INDEX upload_reverse_email_once ON public.upload_reverse_searches(book_id, input_email, owner_filter) WHERE input_email IS NOT NULL;
-- New first searches use the all-persons filter.
ALTER TABLE public.upload_reverse_searches ALTER COLUMN owner_filter SET DEFAULT 'all_persons';

-- One explicitly approved re-search of an owner-only "no match", using the all-persons filter.
CREATE OR REPLACE FUNCTION public.reserve_upload_reverse_rerun(p_search uuid, p_actor uuid, p_max_cost_cents integer, p_month_cap integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _o upload_reverse_searches; _org uuid; _used int; _id uuid;
BEGIN
 IF p_max_cost_cents IS DISTINCT FROM 30 THEN RAISE EXCEPTION 'Reverse spending ceiling exceeded'; END IF;
 SELECT * INTO _o FROM upload_reverse_searches WHERE id=p_search FOR UPDATE;
 SELECT p.lender_org_id INTO _org FROM lender_portfolios p WHERE p.id=_o.book_id AND p.assigned_user_id=p_actor
   AND EXISTS(SELECT 1 FROM lender_members m WHERE m.user_id=p_actor AND m.lender_org_id=p.lender_org_id);
 IF _o.id IS NULL OR _o.requested_by<>p_actor OR _org IS NULL THEN RAISE EXCEPTION 'Search not found' USING ERRCODE='42501'; END IF;
 IF _o.owner_filter<>'owners_only' OR _o.status<>'no_match' OR _o.rerun_of IS NOT NULL THEN RAISE EXCEPTION 'This result is not eligible for a filter-change search'; END IF;
 IF EXISTS(SELECT 1 FROM upload_reverse_searches s JOIN lender_portfolios bp ON bp.id=s.book_id
   WHERE s.owner_filter='all_persons' AND (bp.lender_org_id=_org OR s.requested_by=p_actor OR s.staged_id=_o.staged_id)
   AND (s.staged_id=_o.staged_id OR s.input_phone=_o.input_phone OR s.input_email=_o.input_email))
 THEN RAISE EXCEPTION 'Already searched with the all-persons filter — no repeat paid search'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('upload_reverse_global_spend'));
 SELECT coalesce(sum(coalesce(estimated_cost_cents,reserved_cents)),0) INTO _used FROM upload_reverse_searches WHERE created_at>=date_trunc('month',now());
 SELECT _used+coalesce(sum(CASE WHEN status IN ('pending','provider_error') THEN greatest(estimated_cost_cents,30) ELSE estimated_cost_cents END),0)
   INTO _used FROM batchdata_reverse_lookups WHERE created_at>=date_trunc('month',now());
 IF p_month_cap IS NULL OR _used+30>p_month_cap THEN RAISE EXCEPTION 'Monthly reverse spending limit'; END IF;
 INSERT INTO upload_reverse_searches(batch_id,staged_id,book_id,requested_by,input_phone,input_email,owner_filter,rerun_of)
 VALUES(_o.batch_id,_o.staged_id,_o.book_id,p_actor,_o.input_phone,_o.input_email,'all_persons',_o.id) RETURNING id INTO _id;
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_upload_reverse_rerun(uuid,uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_upload_reverse_rerun(uuid,uuid,integer,integer) TO service_role;