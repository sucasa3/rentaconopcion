-- REVIEW ONLY: do not apply to the shared database without rollout approval.
CREATE TABLE public.upload_reverse_searches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.contact_import_batches(id),
 staged_id uuid NOT NULL REFERENCES public.upload_staged_rows(id), book_id uuid NOT NULL REFERENCES public.lender_portfolios(id),
 requested_by uuid NOT NULL, input_phone text, input_email text, status text NOT NULL DEFAULT 'reserved',
 persons jsonb NOT NULL DEFAULT '[]', estimated_cost_cents integer, reserved_cents integer NOT NULL DEFAULT 30 CHECK(reserved_cents=30),
 billing_basis text NOT NULL DEFAULT 'estimated', provider_request_id text, error_message text,
 created_at timestamptz NOT NULL DEFAULT now(), dispatched_at timestamptz,
 UNIQUE(staged_id)
);
GRANT SELECT ON public.upload_reverse_searches TO authenticated;
GRANT ALL ON public.upload_reverse_searches TO service_role;
ALTER TABLE public.upload_reverse_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY upload_reverse_owner ON public.upload_reverse_searches FOR SELECT TO authenticated
 USING (requested_by=auth.uid() AND EXISTS(SELECT 1 FROM public.lender_portfolios p WHERE p.id=book_id AND p.assigned_user_id=auth.uid()));
CREATE UNIQUE INDEX upload_reverse_phone_once ON public.upload_reverse_searches(book_id,input_phone) WHERE input_phone IS NOT NULL;
CREATE UNIQUE INDEX upload_reverse_email_once ON public.upload_reverse_searches(book_id,input_email) WHERE input_email IS NOT NULL;

CREATE TABLE public.upload_reverse_properties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), search_id uuid NOT NULL REFERENCES public.upload_reverse_searches(id),
 person_index integer NOT NULL, property_key text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'needs_review', staged_id uuid REFERENCES public.upload_staged_rows(id),
 client_id uuid REFERENCES public.lender_portfolio_clients(id), confirmed_at timestamptz,
 UNIQUE(search_id,property_key)
);
GRANT SELECT ON public.upload_reverse_properties TO authenticated;
GRANT ALL ON public.upload_reverse_properties TO service_role;
ALTER TABLE public.upload_reverse_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY upload_reverse_property_owner ON public.upload_reverse_properties FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.upload_reverse_searches s WHERE s.id=search_id AND s.requested_by=auth.uid()
 AND EXISTS(SELECT 1 FROM public.lender_portfolios p WHERE p.id=s.book_id AND p.assigned_user_id=auth.uid())));

-- Reserves the entire worst-case batch before ANY IO. Double clicks/reuploads return existing rows.
CREATE FUNCTION public.reserve_upload_reverse(p_batch uuid,p_actor uuid,p_items jsonb,p_max_lookups integer,p_max_cost_cents integer,p_month_cap integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _book uuid; _org uuid; _r jsonb; _s upload_staged_rows; _existing uuid; _ids uuid[]:='{}'; _new uuid[]:='{}'; _n int; _used int;
BEGIN
 SELECT b.book_id,p.lender_org_id INTO _book,_org FROM contact_import_batches b JOIN lender_portfolios p ON p.id=b.book_id
 WHERE b.id=p_batch AND b.upload_flow='mixed' AND p.assigned_user_id=p_actor
 AND EXISTS(SELECT 1 FROM lender_members m WHERE m.user_id=p_actor AND m.lender_org_id=p.lender_org_id);
 IF _book IS NULL THEN RAISE EXCEPTION 'Upload not found' USING ERRCODE='42501'; END IF;
 _n:=jsonb_array_length(p_items);
 IF _n<1 OR _n>10 OR p_max_lookups IS DISTINCT FROM _n OR p_max_cost_cents IS NULL OR p_max_cost_cents<_n*30 THEN RAISE EXCEPTION 'Reverse spending ceiling exceeded'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('upload_reverse_global_spend'));
 SELECT coalesce(sum(coalesce(estimated_cost_cents,reserved_cents)),0) INTO _used FROM upload_reverse_searches WHERE created_at>=date_trunc('month',now());
 SELECT _used+coalesce(sum(CASE WHEN status IN ('pending','provider_error') THEN greatest(estimated_cost_cents,30) ELSE estimated_cost_cents END),0)
 INTO _used FROM batchdata_reverse_lookups WHERE created_at>=date_trunc('month',now());
 FOR _r IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   SELECT * INTO _s FROM upload_staged_rows WHERE id=(_r->>'stagedId')::uuid AND batch_id=p_batch AND book_id=_book AND outcome='contact_only';
   IF _s.id IS NULL OR (nullif(_r->>'phone','') IS NULL AND nullif(_r->>'email','') IS NULL) THEN RAISE EXCEPTION 'Contact not eligible'; END IF;
   SELECT id INTO _existing FROM upload_reverse_searches WHERE book_id=_book AND (staged_id=_s.id
     OR input_phone=nullif(_r->>'phone','') OR input_email=nullif(_r->>'email','')) LIMIT 1;
   IF _existing IS NULL THEN
     -- Prior searches from EITHER workflow, anywhere in this workspace or by this person, block a paid repeat.
     IF EXISTS(SELECT 1 FROM batchdata_reverse_lookups WHERE (org_id=_org OR requested_by=p_actor) AND
       (input_phone=nullif(_r->>'phone','') OR input_email=nullif(_r->>'email','')))
     OR EXISTS(SELECT 1 FROM upload_reverse_searches s JOIN lender_portfolios bp ON bp.id=s.book_id
       WHERE (bp.lender_org_id=_org OR s.requested_by=p_actor) AND
       (s.input_phone=nullif(_r->>'phone','') OR s.input_email=nullif(_r->>'email','')))
     THEN RAISE EXCEPTION 'Previously searched contact — no repeat paid search'; END IF;
     IF p_month_cap IS NULL OR _used+30>p_month_cap THEN RAISE EXCEPTION 'Monthly reverse spending limit'; END IF;
     INSERT INTO upload_reverse_searches(batch_id,staged_id,book_id,requested_by,input_phone,input_email)
     VALUES(p_batch,_s.id,_book,p_actor,nullif(_r->>'phone',''),nullif(_r->>'email','')) RETURNING id INTO _existing;
     _new:=array_append(_new,_existing); _used:=_used+30;
   END IF;
   _ids:=array_append(_ids,_existing);
 END LOOP;
 RETURN jsonb_build_object('ids',_ids,'dispatchIds',_new,'maxCostCents',cardinality(_new)*30);
END $$;

-- Confirmation is NOT property spending approval. Uses the same capacity lock and intake hold.
CREATE FUNCTION public.confirm_upload_reverse_property(p_property uuid,p_actor uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _p upload_reverse_properties; _s upload_reverse_searches; _org uuid; _type text; _cap int; _client uuid; _row uuid; _next int; _cached boolean; _status text;
BEGIN
 SELECT * INTO _p FROM upload_reverse_properties WHERE id=p_property FOR UPDATE;
 SELECT * INTO _s FROM upload_reverse_searches WHERE id=_p.search_id;
 SELECT p.lender_org_id,o.org_type INTO _org,_type FROM lender_portfolios p JOIN lender_orgs o ON o.id=p.lender_org_id
 WHERE p.id=_s.book_id AND p.assigned_user_id=p_actor AND _s.requested_by=p_actor
 AND EXISTS(SELECT 1 FROM lender_members m WHERE m.user_id=p_actor AND m.lender_org_id=p.lender_org_id);
 IF _org IS NULL THEN RAISE EXCEPTION 'Match not found' USING ERRCODE='42501'; END IF;
 IF _p.status IN ('added','already_in_book') THEN RETURN jsonb_build_object('status',_p.status); END IF;
 -- Only explicit human review of a completed result can confirm; uncertain/suppressed results stay held.
 IF _s.status NOT IN ('matched','needs_review') THEN RAISE EXCEPTION 'Result cannot be confirmed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('org_capacity:'||_org::text));
 PERFORM 1 FROM contact_import_batches WHERE id=_s.batch_id FOR UPDATE;
 SELECT id INTO _client FROM lender_portfolio_clients WHERE portfolio_id=_s.book_id AND archived_at IS NULL AND address_key=_p.payload->>'address_key' LIMIT 1;
 IF _client IS NOT NULL THEN
   UPDATE upload_reverse_properties SET status='already_in_book',client_id=_client,confirmed_at=now() WHERE id=p_property;
   RETURN jsonb_build_object('status','already_in_book');
 END IF;
 IF _type='agent' THEN _cap:=private.agent_credit_remaining(_org);
 ELSE _cap:=org_profile_capacity(_org)-org_active_profile_count(_org); END IF;
 IF coalesce(_cap,0)<=0 THEN
   UPDATE upload_reverse_properties SET status='waiting_capacity',confirmed_at=now() WHERE id=p_property;
   RETURN jsonb_build_object('status','waiting_capacity');
 END IF;
 SELECT EXISTS(SELECT 1 FROM property_intel WHERE lower(split_part(address_line1,',',1))=lower(_p.payload->>'address')
 AND left(zip,5)=left(_p.payload->>'zip',5) AND (avm IS NOT NULL OR detail IS NOT NULL)) INTO _cached;
 PERFORM set_config('sucasa.intake_hold',_s.batch_id::text,true);
 INSERT INTO lender_portfolio_clients(portfolio_id,client_name,client_email,client_phone,address_line1,city,state,zip,address_key)
 VALUES(_s.book_id,_p.payload->>'name',_s.input_email,_s.input_phone,_p.payload->>'address',_p.payload->>'city',_p.payload->>'state',_p.payload->>'zip',_p.payload->>'address_key') RETURNING id INTO _client;
 -- Explicit hold also protects fixtures/test orgs whose enqueue trigger exits early.
 INSERT INTO enrichment_intake_holds(client_id,batch_id) VALUES(_client,_s.batch_id) ON CONFLICT(client_id) DO NOTHING;
 PERFORM set_config('sucasa.intake_hold','',true);
 SELECT coalesce(max(row_number),0)+1 INTO _next FROM upload_staged_rows WHERE batch_id=_s.batch_id;
 _status:=CASE WHEN _cached THEN 'added_cached' ELSE 'added_needs_lookup' END;
 INSERT INTO upload_staged_rows(batch_id,book_id,row_number,outcome,cached,payload,client_id)
 VALUES(_s.batch_id,_s.book_id,_next,_status,_cached,_p.payload,_client) RETURNING id INTO _row;
 UPDATE upload_reverse_properties SET status='added',staged_id=_row,client_id=_client,confirmed_at=now() WHERE id=p_property;
 -- Original CSV row totals remain intact; derived property rows are shown separately by the UI.
 RETURN jsonb_build_object('status','added','cached',_cached);
END $$;
REVOKE EXECUTE ON FUNCTION public.reserve_upload_reverse(uuid,uuid,jsonb,integer,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_upload_reverse_property(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_upload_reverse(uuid,uuid,jsonb,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_upload_reverse_property(uuid,uuid) TO service_role;