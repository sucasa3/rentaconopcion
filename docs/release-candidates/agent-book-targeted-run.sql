-- PREPARED ONLY — DO NOT RUN until Neil approves cost and scope.
-- Prerequisite: worker-concurrency-migration.sql + worker-release-grants.sql applied.
-- Scope: agent book cd328aa6-d0bd-47b6-9edb-4b5057f777d9 only. No other book's jobs are listed.
-- Read-only count on 2026-10-22: 85 homes, 85 distinct addresses; 25 already cached,
-- 60 uncached, 2 of those have a recorded prior no-match (excluded, no re-buy) => 58 billable.
-- Billing estimate: BATCHDATA_EST_COST_CENTS = 10c/lookup (UNVERIFIED with BatchData) => <= $5.80.

-- Grant 1: cache reuse for the 25 cached homes. Zero provider calls allowed.
INSERT INTO public.enrichment_release_grants(portfolio_id, job_ids, max_dispatches, approved_by, approval_note, expires_at)
SELECT 'cd328aa6-d0bd-47b6-9edb-4b5057f777d9', array_agg(q.id), 0, 'Neil Terc', 'agent book cache reuse', now() + interval '1 day'
FROM public.property_enrichment_queue q
JOIN public.lender_portfolio_clients c ON c.id = q.portfolio_client_id AND c.archived_at IS NULL
WHERE q.portfolio_id = 'cd328aa6-d0bd-47b6-9edb-4b5057f777d9' AND q.status = 'pending'
  AND EXISTS (SELECT 1 FROM public.property_intel p WHERE p.address_normalized =
    lower(regexp_replace(trim(concat_ws(', ', c.address_line1, c.city, concat_ws(' ', c.state, c.zip))), '\s+', ' ', 'g')));

-- Grant 2: new BatchData lookups, deduplicated by address, hard-capped at 60.
INSERT INTO public.enrichment_release_grants(portfolio_id, job_ids, max_dispatches, approved_by, approval_note, expires_at)
SELECT 'cd328aa6-d0bd-47b6-9edb-4b5057f777d9', array_agg(id), 60, 'Neil Terc', 'agent book 60 uncached', now() + interval '1 day'
FROM (
  SELECT DISTINCT ON (k) q.id, k FROM public.property_enrichment_queue q
  JOIN public.lender_portfolio_clients c ON c.id = q.portfolio_client_id AND c.archived_at IS NULL
  CROSS JOIN LATERAL (SELECT lower(regexp_replace(trim(concat_ws(', ', c.address_line1, c.city, concat_ws(' ', c.state, c.zip))), '\s+', ' ', 'g')) k) n
  WHERE q.portfolio_id = 'cd328aa6-d0bd-47b6-9edb-4b5057f777d9' AND q.status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM public.property_intel p WHERE p.address_normalized = k)
    AND NOT EXISTS (SELECT 1 FROM public.property_intel_misses m WHERE m.address_normalized = k)
  ORDER BY k, q.created_at LIMIT 60
) s;
-- Abort: UPDATE public.enrichment_release_grants SET revoked_at = now() WHERE revoked_at IS NULL;
