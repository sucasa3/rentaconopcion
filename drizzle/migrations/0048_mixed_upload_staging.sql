-- Mixed-list upload staging + batch spend approval. Additive only.

ALTER TABLE public.contact_import_batches
  ADD COLUMN IF NOT EXISTS upload_flow text,
  ADD COLUMN IF NOT EXISTS spend_approved_lookups integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spend_approved_by uuid,
  ADD COLUMN IF NOT EXISTS spend_approved_at timestamptz;

CREATE TABLE IF NOT EXISTS public.upload_staged_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.contact_import_batches(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.lender_portfolios(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('added_cached','added_needs_lookup','contact_only','waiting_capacity',
                                            'duplicate_in_file','already_uploaded','unusable','suppressed')),
  identity_key text,
  cached boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_id uuid REFERENCES public.lender_portfolio_clients(id) ON DELETE SET NULL,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS upload_staged_rows_kept_key
  ON public.upload_staged_rows (book_id, identity_key)
  WHERE outcome IN ('contact_only','waiting_capacity') AND promoted_at IS NULL;

GRANT SELECT ON public.upload_staged_rows TO authenticated;
GRANT ALL ON public.upload_staged_rows TO service_role;
ALTER TABLE public.upload_staged_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Book members read staged upload rows" ON public.upload_staged_rows
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lender_portfolios p WHERE p.id = book_id
                 AND public.lender_book_visible(auth.uid(), p.lender_org_id, p.assigned_user_id)));

CREATE OR REPLACE FUNCTION public.stage_mixed_upload(
  p_book uuid, p_actor uuid, p_file_sha256 text, p_flow text, p_rows jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid; _org_type text; _assigned uuid; _batch uuid; _cap int; _r jsonb; _outcome text;
  _client uuid; _p jsonb; _kept_dup boolean;
BEGIN
  SELECT p.lender_org_id, o.org_type, p.assigned_user_id INTO _org, _org_type, _assigned
    FROM lender_portfolios p JOIN lender_orgs o ON o.id = p.lender_org_id WHERE p.id = p_book;
  IF _org IS NULL OR _assigned IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Uploads go only into your own book' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _batch FROM contact_import_batches
   WHERE book_id = p_book AND file_sha256 = p_file_sha256 AND upload_flow = 'mixed';
  IF _batch IS NOT NULL THEN
    RETURN jsonb_build_object('batch_id', _batch, 'replayed', true,
      'counts', (SELECT counts FROM contact_import_batches WHERE id = _batch));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('org_capacity:' || _org::text));
  IF _org_type = 'agent' THEN
    _cap := private.agent_credit_remaining(_org);
  ELSE
    _cap := org_profile_capacity(_org) - org_active_profile_count(_org);
  END IF;
  _cap := greatest(coalesce(_cap, 0), 0);

  INSERT INTO contact_import_batches (book_id, created_by, file_sha256, total_rows, counts, enrichment_hold, upload_flow)
  VALUES (p_book, p_actor, p_file_sha256, jsonb_array_length(p_rows), '{}'::jsonb, true, 'mixed')
  RETURNING id INTO _batch;
  PERFORM set_config('sucasa.intake_hold', _batch::text, true);

  FOR _r IN SELECT * FROM jsonb_array_elements(p_rows) ORDER BY (value->>'row_number')::int LOOP
    _outcome := _r->>'outcome'; _p := coalesce(_r->'payload', '{}'::jsonb); _client := NULL;
    IF _outcome IN ('added_cached','added_needs_lookup') THEN
      IF EXISTS (SELECT 1 FROM lender_portfolio_clients WHERE portfolio_id = p_book AND archived_at IS NULL
                 AND address_key = _p->>'address_key') THEN
        _outcome := 'already_uploaded';
      ELSIF _cap <= 0 THEN
        _outcome := 'waiting_capacity';
      ELSE
        INSERT INTO lender_portfolio_clients (portfolio_id, client_name, client_email, client_phone,
          address_line1, city, state, zip, address_key, loan_amount_at_close_cents, rate_at_close)
        VALUES (p_book, _p->>'name', _p->>'email', _p->>'phone', _p->>'address', _p->>'city',
          _p->>'state', _p->>'zip', _p->>'address_key',
          CASE WHEN p_flow = 'lender' THEN nullif(_p->>'loan_balance_cents','')::bigint END,
          CASE WHEN p_flow = 'lender' THEN nullif(_p->>'interest_rate_bps','')::numeric / 100 END)
        RETURNING id INTO _client;
        _cap := _cap - 1;
      END IF;
    END IF;
    IF _outcome IN ('contact_only','waiting_capacity') THEN
      SELECT true INTO _kept_dup FROM upload_staged_rows WHERE book_id = p_book AND identity_key = _r->>'identity_key'
        AND outcome IN ('contact_only','waiting_capacity') AND promoted_at IS NULL;
      IF _kept_dup THEN _outcome := 'already_uploaded'; END IF;
      _kept_dup := NULL;
    END IF;
    INSERT INTO upload_staged_rows (batch_id, book_id, row_number, outcome, identity_key, cached, payload, client_id)
    VALUES (_batch, p_book, (_r->>'row_number')::int, _outcome, _r->>'identity_key',
            coalesce((_r->>'cached')::boolean, false), _p, _client);
  END LOOP;
  PERFORM set_config('sucasa.intake_hold', '', true);

  UPDATE contact_import_batches SET counts = (
    SELECT jsonb_object_agg(outcome, n) FROM (SELECT outcome, count(*) n FROM upload_staged_rows
      WHERE batch_id = _batch GROUP BY outcome) s) WHERE id = _batch
  RETURNING id INTO _batch;
  RETURN jsonb_build_object('batch_id', _batch, 'replayed', false,
    'counts', (SELECT counts FROM contact_import_batches WHERE id = _batch));
END $$;

CREATE OR REPLACE FUNCTION public.approve_upload_spend(
  p_batch uuid, p_actor uuid, p_max_lookups integer, p_max_cost_cents integer, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _book uuid; _cached uuid[]; _paid_ids uuid[]; _cjobs uuid[]; _pjobs uuid[];
  _cgrant uuid; _pgrant uuid; _unit constant int := 10;
BEGIN
  SELECT b.book_id INTO _book FROM contact_import_batches b JOIN lender_portfolios p ON p.id = b.book_id
   WHERE b.id = p_batch AND b.upload_flow = 'mixed' AND p.assigned_user_id = p_actor
   FOR UPDATE OF b;
  IF _book IS NULL THEN RAISE EXCEPTION 'Not allowed to approve this upload' USING ERRCODE = '42501'; END IF;
  IF p_max_lookups IS NULL OR p_max_lookups < 0 OR p_max_lookups > 500 THEN
    RAISE EXCEPTION 'Approved lookups must be between 0 and 500';
  END IF;
  IF p_max_cost_cents IS NULL OR p_max_cost_cents < 0 OR p_max_lookups * _unit > p_max_cost_cents THEN
    RAISE EXCEPTION 'Approved lookups exceed the confirmed spending limit';
  END IF;

  WITH held AS (
    SELECT h.client_id, s.cached, s.row_number FROM enrichment_intake_holds h
      JOIN upload_staged_rows s ON s.client_id = h.client_id AND s.batch_id = p_batch
     WHERE h.batch_id = p_batch AND h.released_at IS NULL
  ), rel AS (
    UPDATE enrichment_intake_holds SET released_at = now(), released_by = p_actor
     WHERE released_at IS NULL AND client_id IN (SELECT client_id FROM held WHERE cached)
     RETURNING client_id
  ) SELECT coalesce(array_agg(client_id), '{}') INTO _cached FROM rel;

  WITH pick AS (
    SELECT h.client_id FROM enrichment_intake_holds h
      JOIN upload_staged_rows s ON s.client_id = h.client_id AND s.batch_id = p_batch
     WHERE h.batch_id = p_batch AND h.released_at IS NULL AND NOT s.cached
     ORDER BY s.row_number LIMIT p_max_lookups
  ), rel AS (
    UPDATE enrichment_intake_holds SET released_at = now(), released_by = p_actor
     WHERE released_at IS NULL AND client_id IN (SELECT client_id FROM pick) RETURNING client_id
  ) SELECT coalesce(array_agg(client_id), '{}') INTO _paid_ids FROM rel;

  INSERT INTO property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
  SELECT c.id, c.portfolio_id, 50 FROM lender_portfolio_clients c
   WHERE c.id = ANY(_cached || _paid_ids) AND c.archived_at IS NULL
  ON CONFLICT (portfolio_client_id) DO NOTHING;
  SELECT coalesce(array_agg(q.id), '{}') INTO _cjobs FROM property_enrichment_queue q WHERE q.portfolio_client_id = ANY(_cached);
  SELECT coalesce(array_agg(q.id), '{}') INTO _pjobs FROM property_enrichment_queue q WHERE q.portfolio_client_id = ANY(_paid_ids);

  IF cardinality(_cjobs) > 0 THEN
    INSERT INTO enrichment_release_grants (portfolio_id, job_ids, max_dispatches, approved_by, approval_note, expires_at)
    VALUES (_book, _cjobs, 0, p_actor::text, 'Saved records only · upload ' || p_batch::text, now() + interval '7 days')
    RETURNING id INTO _cgrant;
  END IF;
  IF cardinality(_pjobs) > 0 THEN
    INSERT INTO enrichment_release_grants (portfolio_id, job_ids, max_dispatches, approved_by, approval_note, expires_at)
    VALUES (_book, _pjobs, cardinality(_pjobs), p_actor::text,
            coalesce(p_note, 'Upload ' || p_batch::text) || ' · max ' || p_max_cost_cents || '¢', now() + interval '7 days')
    RETURNING id INTO _pgrant;
  END IF;
  UPDATE contact_import_batches SET spend_approved_lookups = spend_approved_lookups + cardinality(_pjobs),
    spend_approved_by = p_actor, spend_approved_at = now() WHERE id = p_batch;
  RETURN jsonb_build_object('released', cardinality(_cjobs) + cardinality(_pjobs), 'paid_lookups', cardinality(_pjobs),
    'cached_reuse', cardinality(_cjobs), 'max_cost_cents', cardinality(_pjobs) * _unit,
    'cached_grant_id', _cgrant, 'grant_id', _pgrant);
END $$;

REVOKE EXECUTE ON FUNCTION public.stage_mixed_upload(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_upload_spend(uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_mixed_upload(uuid, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_upload_spend(uuid, uuid, integer, integer, text) TO service_role;