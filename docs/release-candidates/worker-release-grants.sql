-- REVIEW ONLY. Apply immediately AFTER worker-concurrency-migration.sql, in the
-- same transaction. Not applied to hosted services.
--
-- Default-deny release scope: once the claim RPC exists, the worker may claim
-- ONLY queue rows listed in an active, operator-created grant. With no grant
-- rows the worker claims nothing, so installing the repair never releases any
-- customer's queued records. Provider dispatches are additionally capped per
-- grant and refused for an address already dispatched under the same grant.
CREATE TABLE public.enrichment_release_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL,
  job_ids uuid[] NOT NULL,
  max_dispatches integer NOT NULL CHECK (max_dispatches >= 0),
  approved_by text NOT NULL CHECK (length(trim(approved_by)) > 0),
  approval_note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
GRANT ALL ON public.enrichment_release_grants TO service_role;
REVOKE ALL ON public.enrichment_release_grants FROM anon, authenticated;
ALTER TABLE public.enrichment_release_grants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.enrichment_dispatches ADD COLUMN IF NOT EXISTS grant_id uuid;

-- Active grant covering a job; jobs must also belong to the grant's book.
CREATE OR REPLACE FUNCTION public.enrichment_job_grant(p_job uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g.id FROM public.enrichment_release_grants g
    JOIN public.property_enrichment_queue q ON q.id = p_job AND q.portfolio_id = g.portfolio_id
   WHERE p_job = ANY (g.job_ids) AND g.revoked_at IS NULL AND g.expires_at > clock_timestamp()
   ORDER BY g.created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.enrichment_job_grant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enrichment_job_grant(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_enrichment_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.property_enrichment_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 25 THEN
    RAISE EXCEPTION 'Invalid enrichment batch size';
  END IF;
  WITH expired AS MATERIALIZED (
    SELECT q.id FROM public.property_enrichment_queue q
      WHERE EXISTS (SELECT 1 FROM public.enrichment_dispatches d WHERE d.job_id=q.id AND d.state='dispatched')
        AND (q.status <> 'running' OR q.lease_expires_at IS NULL OR q.lease_expires_at <= clock_timestamp())
      ORDER BY q.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.enrichment_dispatches d SET state = 'uncertain'
    FROM expired e WHERE d.job_id=e.id AND d.state='dispatched';
  RETURN QUERY
    WITH ready AS (
      SELECT q.id FROM public.property_enrichment_queue q
      WHERE public.enrichment_job_grant(q.id) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.enrichment_dispatches d
        WHERE d.job_id = q.id AND (d.state IN ('dispatched','uncertain') OR
          (d.state = 'responded' AND d.address_normalized IS DISTINCT FROM q.address_normalized)))
        AND ((q.status = 'pending' AND q.next_attempt_at <= clock_timestamp())
         OR (q.status = 'running' AND
           (q.lease_expires_at <= clock_timestamp() OR
            (q.claim_token IS NULL AND coalesce(q.started_at, q.updated_at, q.created_at) < clock_timestamp() - interval '15 minutes'))))
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

CREATE OR REPLACE FUNCTION public.begin_enrichment_dispatch(p_id uuid, p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job public.property_enrichment_queue%ROWTYPE; d public.enrichment_dispatches%ROWTYPE;
  g public.enrichment_release_grants%ROWTYPE; gid uuid; used integer;
BEGIN
  SELECT q.* INTO job FROM public.property_enrichment_queue q WHERE q.id=p_id FOR UPDATE;
  IF NOT FOUND OR job.status <> 'running' OR job.claim_token IS DISTINCT FROM p_token
    OR job.lease_expires_at IS NULL OR job.lease_expires_at <= clock_timestamp()
    OR job.address_normalized IS NULL THEN RETURN NULL; END IF;
  SELECT x.* INTO d FROM public.enrichment_dispatches x
    WHERE x.job_id=p_id AND x.state IN ('dispatched','uncertain','responded') FOR UPDATE;
  IF FOUND THEN
    IF d.state='responded' AND d.address_normalized=job.address_normalized THEN
      RETURN jsonb_build_object('id',d.id,'replay',true,'response',d.response);
    END IF;
    RETURN NULL;
  END IF;
  gid := public.enrichment_job_grant(p_id);
  IF gid IS NULL THEN RETURN NULL; END IF;
  -- Serialize spend per grant; count every non-refuted dispatch as billable.
  SELECT x.* INTO g FROM public.enrichment_release_grants x WHERE x.id=gid FOR UPDATE;
  SELECT count(*) INTO used FROM public.enrichment_dispatches x
    WHERE x.grant_id=gid AND x.state <> 'confirmed_not_sent';
  IF used >= g.max_dispatches THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.enrichment_dispatches x WHERE x.grant_id=gid
      AND x.address_normalized=job.address_normalized AND x.state <> 'confirmed_not_sent') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.enrichment_dispatches(job_id,claim_token,address_normalized,state,grant_id)
    VALUES(p_id,p_token,job.address_normalized,'dispatched',gid) RETURNING * INTO d;
  RETURN jsonb_build_object('id',d.id,'replay',false);
END;
$$;
REVOKE ALL ON FUNCTION public.begin_enrichment_dispatch(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_enrichment_dispatch(uuid,uuid) TO service_role;
