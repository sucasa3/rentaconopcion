-- READ-ONLY PREFLIGHT. NOT RUN. Run before applying household-import-migration.sql.
-- Lists books where 2+ existing clients share an approximate property key.
-- The app's unit-aware addressKey() is authoritative; this SQL approximation
-- only sizes the problem. Any collision found here (or by the app at import
-- time) is never registered as a property key and its rows go to needs_review.
SELECT c.portfolio_id,
       lower(regexp_replace(btrim(c.address_line1), '\s+', ' ', 'g')) || '|' || left(coalesce(c.zip, ''), 5) AS approx_key,
       count(*) AS clients,
       array_agg(c.id ORDER BY c.created_at) AS client_ids
FROM public.lender_portfolio_clients c
WHERE c.address_line1 IS NOT NULL AND btrim(c.address_line1) <> ''
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY clients DESC;

-- Existing address_key collisions are already impossible for active rows
-- (uniq_portfolio_client_address_key). Rows with NULL address_key are the
-- legacy-lender population the query above covers.
SELECT count(*) FILTER (WHERE address_key IS NULL) AS without_key, count(*) AS total
FROM public.lender_portfolio_clients;
