-- REVIEW ONLY. Not registered in either migration runner; not applied to hosted services.
-- Additive queue ownership. Deploy only with all old worker invocations drained.
ALTER TABLE public.property_enrichment_queue
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_peq_expired_claim
  ON public.property_enrichment_queue (lease_expires_at) WHERE status = 'running';

-- Every existing external reset/requeue invalidates a running token. No stale
-- worker can reuse a token after address changes, deletion, or manual retry.
CREATE OR REPLACE FUNCTION public.tg_enrichment_invalidate_claim()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status <> 'running' THEN
    NEW.claim_token := NULL;
    NEW.lease_expires_at := NULL;
    NEW.started_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_enrichment_invalidate_claim
  BEFORE UPDATE ON public.property_enrichment_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_enrichment_invalidate_claim();

CREATE OR REPLACE FUNCTION public.claim_enrichment_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.property_enrichment_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 25 THEN
    RAISE EXCEPTION 'Invalid enrichment batch size';
  END IF;
  RETURN QUERY
    WITH ready AS (
      SELECT q.id FROM public.property_enrichment_queue q
      WHERE (q.status = 'pending' AND q.next_attempt_at <= clock_timestamp())
         OR (q.status = 'running' AND
           (q.lease_expires_at <= clock_timestamp() OR
            (q.claim_token IS NULL AND q.started_at < clock_timestamp() - interval '15 minutes')))
      ORDER BY q.priority, q.next_attempt_at, q.id
      LIMIT p_limit FOR UPDATE SKIP LOCKED
    )
    UPDATE public.property_enrichment_queue q
      SET status = 'running', claim_token = gen_random_uuid(),
          started_at = clock_timestamp(),
          lease_expires_at = clock_timestamp() + interval '15 minutes'
    FROM ready WHERE q.id = ready.id RETURNING q.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_enrichment_claim(p_id uuid, p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.property_enrichment_queue
    SET lease_expires_at = clock_timestamp() + interval '15 minutes'
    WHERE id = p_id AND claim_token = p_token AND status = 'running'
      AND lease_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_enrichment_claim(
  p_id uuid, p_token uuid, p_patch jsonb, p_client_patch jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  job public.property_enrichment_queue%ROWTYPE;
  next_job public.property_enrichment_queue%ROWTYPE;
  next_client public.lender_portfolio_clients%ROWTYPE;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR
     p_client_patch IS NULL OR jsonb_typeof(p_client_patch) <> 'object' OR
     EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN
       ('status','attempts','last_result','last_error','completed_at','next_attempt_at','address_normalized','address_verified_at')) OR
     EXISTS (SELECT 1 FROM jsonb_object_keys(p_client_patch) k WHERE k NOT IN
       ('address_line1','city','state','zip','last_intel_refreshed_at','loan_amount_at_close_cents','close_date','term_months')) THEN
    RAISE EXCEPTION 'Invalid enrichment mutation';
  END IF;
  -- Consistent client-before-queue lock order matches the address requeue trigger.
  SELECT q.* INTO job FROM public.property_enrichment_queue q WHERE q.id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM public.lender_portfolio_clients c
    WHERE c.id = job.portfolio_client_id FOR UPDATE;
  SELECT q.* INTO job FROM public.property_enrichment_queue q WHERE q.id = p_id FOR UPDATE;
  IF NOT FOUND OR job.claim_token IS DISTINCT FROM p_token OR job.status <> 'running'
     OR job.lease_expires_at IS NULL OR job.lease_expires_at <= clock_timestamp() THEN RETURN; END IF;

  next_job := jsonb_populate_record(job, p_patch);
  IF p_client_patch <> '{}'::jsonb THEN
    SELECT (jsonb_populate_record(c, p_client_patch)).* INTO next_client
      FROM public.lender_portfolio_clients c WHERE c.id = job.portfolio_client_id AND c.archived_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;
    UPDATE public.lender_portfolio_clients c SET
      address_line1 = next_client.address_line1, city = next_client.city,
      state = next_client.state, zip = next_client.zip,
      last_intel_refreshed_at = next_client.last_intel_refreshed_at,
      loan_amount_at_close_cents = CASE WHEN p_client_patch ? 'loan_amount_at_close_cents'
        THEN coalesce(c.loan_amount_at_close_cents, next_client.loan_amount_at_close_cents) ELSE c.loan_amount_at_close_cents END,
      close_date = CASE WHEN p_client_patch ? 'close_date' THEN coalesce(c.close_date, next_client.close_date) ELSE c.close_date END,
      term_months = CASE WHEN p_client_patch ? 'term_months' THEN coalesce(c.term_months, next_client.term_months) ELSE c.term_months END
      WHERE c.id = job.portfolio_client_id;
    -- Our own verified-address update fires the existing requeue trigger. Both
    -- rows are locked; restore only our claim/history within this transaction.
    -- An outside address edit cannot interleave and still invalidates the token.
    UPDATE public.property_enrichment_queue q SET status = 'running',
      claim_token = job.claim_token, lease_expires_at = job.lease_expires_at,
      started_at = job.started_at WHERE q.id = p_id;
  END IF;
  UPDATE public.property_enrichment_queue q SET
    status = next_job.status, attempts = next_job.attempts,
    last_result = next_job.last_result, last_error = next_job.last_error,
    completed_at = next_job.completed_at, next_attempt_at = next_job.next_attempt_at,
    address_normalized = next_job.address_normalized, address_verified_at = next_job.address_verified_at
    WHERE q.id = p_id;
  RETURN QUERY SELECT p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_enrichment_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_enrichment_claim(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_enrichment_claim(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_enrichment_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_enrichment_claim(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.write_enrichment_claim(uuid, uuid, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.tg_enrichment_invalidate_claim() FROM PUBLIC, anon, authenticated;

-- Narrow shared-cache upserts; no accounting or arbitrary-table mutations.
CREATE OR REPLACE FUNCTION public.persist_enrichment_cache(
  p_id uuid, p_token uuid, p_table text, p_patch jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  job public.property_enrichment_queue%ROWTYPE;
  cols text;
  values_sql text;
  assignments text;
  conflict_cols text;
BEGIN
  IF p_table NOT IN ('property_intel', 'property_intel_misses') OR
     p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR
     NOT (p_patch ? 'address_normalized') OR
     EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k IN ('id','created_at','updated_at') OR
       NOT EXISTS (SELECT 1 FROM pg_attribute a
         WHERE a.attrelid = to_regclass('public.' || p_table) AND a.attname = k AND a.attnum > 0 AND NOT a.attisdropped)) THEN
    RAISE EXCEPTION 'Invalid enrichment cache mutation';
  END IF;
  SELECT q.* INTO job FROM public.property_enrichment_queue q WHERE q.id = p_id FOR UPDATE;
  IF NOT FOUND OR job.claim_token IS DISTINCT FROM p_token OR job.status <> 'running'
     OR job.lease_expires_at IS NULL OR job.lease_expires_at <= clock_timestamp() OR
     job.address_normalized IS DISTINCT FROM p_patch->>'address_normalized' THEN RETURN false; END IF;
  IF p_table = 'property_intel_misses' AND NOT (p_patch ? 'endpoint') THEN
    RAISE EXCEPTION 'Invalid enrichment cache mutation';
  END IF;
  SELECT string_agg(format('%I', k), ', ' ORDER BY k),
         string_agg(format('r.%I', k), ', ' ORDER BY k),
         string_agg(format('%I = EXCLUDED.%I', k, k), ', ' ORDER BY k)
    INTO cols, values_sql, assignments FROM jsonb_object_keys(p_patch) k;
  conflict_cols := CASE WHEN p_table = 'property_intel' THEN 'address_normalized' ELSE 'address_normalized, endpoint' END;
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r ON CONFLICT (%s) DO UPDATE SET %s',
    p_table, cols, values_sql, p_table, conflict_cols, assignments) USING p_patch;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_enrichment_cache(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_enrichment_cache(uuid, uuid, text, jsonb) TO service_role;