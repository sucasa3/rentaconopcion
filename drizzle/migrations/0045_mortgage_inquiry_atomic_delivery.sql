ALTER TABLE public.homeowner_lending_requests ADD COLUMN IF NOT EXISTS property_address jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS shared_value_equity jsonb, ADD COLUMN IF NOT EXISTS source_path text NOT NULL DEFAULT '/money', ADD COLUMN IF NOT EXISTS capacity_pending boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.record_homeowner_lending_inquiry(p_homeowner uuid, p_designation uuid, p_channel text, p_email text, p_phone text, p_include_financial boolean, p_financial jsonb, p_version text, p_language text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.agent_lending_designations%ROWTYPE; me public.profiles%ROWTYPE; r public.homeowner_lending_requests%ROWTYPE;
 b uuid; c uuid; consent uuid; opp uuid; batch uuid; pending boolean := false; fields text[] := ARRAY['name','contact','address']; allocated int;
BEGIN
 SELECT * INTO d FROM public.agent_lending_designations WHERE id=p_designation AND removed_at IS NULL FOR SHARE;
 IF d.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.agent_lender_connections x WHERE x.id=d.connection_id AND x.agent_org_id=d.agent_org_id AND x.lender_org_id=d.lender_org_id AND x.status='connected' FOR SHARE)
 OR NOT EXISTS (SELECT 1 FROM public.lender_members WHERE lender_org_id=d.lender_org_id AND user_id=d.lo_user_id)
 OR NOT EXISTS (SELECT 1 FROM public.lender_portfolio_clients x JOIN public.lender_portfolios p ON p.id=x.portfolio_id JOIN public.lender_orgs o ON o.id=p.lender_org_id WHERE x.homeowner_id=p_homeowner AND x.archived_at IS NULL AND p.lender_org_id=d.agent_org_id AND o.org_type='agent') THEN RAISE EXCEPTION 'This lending contact is no longer available'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('org_profile_capacity:' || d.lender_org_id::text));
 SELECT * INTO r FROM public.homeowner_lending_requests WHERE homeowner_id=p_homeowner AND lo_user_id=d.lo_user_id AND status='open';
 IF r.id IS NOT NULL THEN RETURN jsonb_build_object('requestId',r.id,'duplicate',true,'capacityPending',r.capacity_pending); END IF;
 IF p_channel NOT IN ('email','phone') OR (p_channel='email' AND nullif(btrim(p_email),'') IS NULL) OR (p_channel='phone' AND nullif(btrim(p_phone),'') IS NULL) THEN RAISE EXCEPTION 'Select valid contact information'; END IF;
 SELECT * INTO me FROM public.profiles WHERE id=p_homeowner;
 IF nullif(btrim(me.address),'') IS NULL THEN RAISE EXCEPTION 'Add your home address before requesting a conversation'; END IF;
 SELECT id INTO b FROM public.lender_portfolios WHERE lender_org_id=d.lender_org_id AND assigned_user_id=d.lo_user_id ORDER BY created_at,id LIMIT 1 FOR SHARE;
 IF b IS NULL THEN RAISE EXCEPTION 'This lending contact cannot receive requests right now'; END IF;
 SELECT id INTO c FROM public.lender_portfolio_clients WHERE portfolio_id=b AND homeowner_id=p_homeowner AND (archived_at IS NULL OR archived_reason='inbound_capacity_pending') ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF p_include_financial THEN fields := fields || ARRAY['value_equity']; END IF;
 INSERT INTO public.consent_records(homeowner_id,recipient_org_id,recipient_kind,consent_type,scope,source,disclosure_version,context)
 VALUES(p_homeowner,d.lender_org_id,'lender','connection_request',fields,'homeowner_action',p_version,jsonb_build_object('source_path','/money','via','money_lending_contact','topic','financing','lo_user_id',d.lo_user_id,'agent_org_id',d.agent_org_id,'channel',p_channel,'marketing',false,'include_value_equity',p_include_financial,'consent_language',p_language)) RETURNING id INTO consent;
 IF c IS NULL THEN
 SELECT coalesce(sum(credits_granted),0) INTO allocated FROM public.sponsored_agent_seats WHERE sponsor_org_id=d.lender_org_id AND status='active';
 pending := public.org_active_profile_count(d.lender_org_id) + allocated >= coalesce(public.org_profile_capacity(d.lender_org_id),0);
 INSERT INTO public.contact_import_batches(book_id,created_by,file_sha256,total_rows) VALUES(b,d.lo_user_id,'mortgage-inquiry:' || consent::text,1) RETURNING id INTO batch;
 PERFORM set_config('sucasa.intake_hold',batch::text,true);
 INSERT INTO public.lender_portfolio_clients(portfolio_id,homeowner_id,client_name,client_email,client_phone,address_line1,city,state,zip,relationship_basis,contact_marketing_permission,intelligence_access_scope,archived_at,archived_reason)
 VALUES(b,p_homeowner,me.full_name,CASE WHEN p_channel='email' THEN p_email END,CASE WHEN p_channel='phone' THEN p_phone END,me.address,me.city,me.state,me.zip,'homeowner_requested','false',ARRAY['contact','property_snapshot','valuation','mortgage','equity'],CASE WHEN pending THEN now() END,CASE WHEN pending THEN 'inbound_capacity_pending' END) RETURNING id INTO c;
 PERFORM set_config('sucasa.intake_hold','',true);
 ELSE
 SELECT archived_reason='inbound_capacity_pending' INTO pending FROM public.lender_portfolio_clients WHERE id=c;
 pending := coalesce(pending,false);
 END IF;
 INSERT INTO public.homeowner_opportunities(portfolio_client_id,org_id,category,strength,state,signal_key,reasons,reason_codes,score)
 VALUES(c,d.lender_org_id,'mortgage_review','strong','open','homeowner_requested_conversation',ARRAY['Homeowner asked for a financing conversation'],ARRAY['homeowner_requested'],95)
 ON CONFLICT(portfolio_client_id,category) DO UPDATE SET state='open',strength='strong',signal_key=excluded.signal_key,reasons=excluded.reasons,reason_codes=excluded.reason_codes,score=95,computed_at=now() RETURNING id INTO opp;
 INSERT INTO public.homeowner_lending_requests(homeowner_id,designation_id,agent_org_id,lender_org_id,lo_user_id,lender_client_id,opportunity_id,consent_record_id,contact_name,contact_email,contact_phone,preferred_channel,shared_fields,disclosure_version,property_address,shared_value_equity,capacity_pending)
 VALUES(p_homeowner,d.id,d.agent_org_id,d.lender_org_id,d.lo_user_id,c,opp,consent,me.full_name,CASE WHEN p_channel='email' THEN p_email END,CASE WHEN p_channel='phone' THEN p_phone END,p_channel,fields,p_version,jsonb_build_object('address',me.address,'city',me.city,'state',me.state,'zip',me.zip),CASE WHEN p_include_financial THEN p_financial END,pending) RETURNING * INTO r;
 INSERT INTO public.lender_activity(lender_org_id,portfolio_client_id,actor_user_id,action,detail) VALUES(d.lender_org_id,c,p_homeowner,'homeowner_conversation_request','Homeowner asked for a mortgage conversation');
 RETURN jsonb_build_object('requestId',r.id,'duplicate',false,'capacityPending',pending);
END $$;
REVOKE ALL ON FUNCTION public.record_homeowner_lending_inquiry(uuid,uuid,text,text,text,boolean,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_homeowner_lending_inquiry(uuid,uuid,text,text,text,boolean,jsonb,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.tg_resolve_homeowner_lending_inquiry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NEW.stage IN ('closed','not_interested') THEN UPDATE public.homeowner_lending_requests SET status='resolved' WHERE lender_client_id=NEW.portfolio_client_id AND lender_org_id=NEW.org_id AND status='open'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_resolve_homeowner_lending_inquiry AFTER INSERT ON public.opportunity_outcomes FOR EACH ROW EXECUTE FUNCTION public.tg_resolve_homeowner_lending_inquiry();