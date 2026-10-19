-- APPROVAL EVIDENCE ONLY: SELECT statements; no migration or production mutation.
-- Counts must be refreshed immediately before any later approved shadow mapping.
SELECT now() AS captured_at,
 (SELECT count(*) FROM public.lender_portfolio_clients) AS client_rows,
 (SELECT count(*) FROM public.lender_portfolio_clients WHERE address_key IS NULL) AS missing_identity_keys,
 (SELECT count(*) FROM public.lender_portfolios) AS books,
 (SELECT count(*) FROM public.property_intel) AS provider_cache_rows,
 (SELECT count(*) FROM public.home_profiles) AS user_home_profiles,
 (SELECT count(*) FROM public.relationships) AS relationship_edges,
 (SELECT count(*) FROM public.homeowner_opportunities) AS property_opportunities,
 (SELECT count(*) FROM public.property_enrichment_queue) AS queue_rows;

SELECT c.relname, c.relrowsecurity, p.polname, p.polpermissive, p.polcmd,
 pg_get_expr(p.polqual,p.polrelid) AS using_expression,
 pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid=c.oid
WHERE n.nspname='public' AND c.relname IN
 ('lender_portfolio_clients','lender_portfolios','property_intel','home_profiles',
  'relationships','homeowner_opportunities','property_enrichment_queue','business_task_state')
ORDER BY c.relname,p.polname;

SELECT c.relname, r.rolname, a.privilege_type
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
JOIN pg_roles r ON r.oid=a.grantee
WHERE n.nspname='public' AND c.relname IN
 ('lender_portfolio_clients','lender_portfolios','property_intel','home_profiles',
  'relationships','homeowner_opportunities','property_enrichment_queue')
AND r.rolname IN ('anon','authenticated','service_role') ORDER BY c.relname,r.rolname,a.privilege_type;

SELECT conrelid::regclass::text AS entity,conname,pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace='public'::regnamespace
AND conrelid::regclass::text IN
 ('lender_portfolio_clients','lender_portfolios','property_intel','home_profiles',
  'relationships','homeowner_opportunities','property_enrichment_queue','business_task_state');

SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('lender_portfolio_clients','lender_portfolios','property_intel','home_profiles',
 'relationships','homeowner_opportunities','property_enrichment_queue','business_task_state');

SELECT tg.tgname, pg_get_triggerdef(tg.oid), pg_get_functiondef(tg.tgfoid)
FROM pg_trigger tg WHERE NOT tg.tgisinternal AND tg.tgrelid='public.lender_portfolio_clients'::regclass;

-- Conservative shadow projection: no identity merges and no household assertions.
SELECT count(*) AS preserved_clients, count(*) AS provisional_contacts,
 count(*) AS asserted_source_contact_links,
 count(*) FILTER(WHERE nullif(trim(address_line1),'') IS NOT NULL) AS provisional_property_refs,
 count(*) FILTER(WHERE nullif(trim(address_line1),'') IS NULL) AS held_addressless,
 0 AS confirmed_households, 0 AS lookup_jobs_created, 0 AS credit_spends_created
FROM public.lender_portfolio_clients;

SELECT count(*) FILTER(WHERE p.id IS NULL) AS orphan_books,
 count(*) FILTER(WHERE q.id IS NULL) AS missing_queue,
 count(*) FILTER(WHERE q.id IS NOT NULL AND q.portfolio_id IS DISTINCT FROM c.portfolio_id) AS stale_queue_book
FROM public.lender_portfolio_clients c LEFT JOIN public.lender_portfolios p ON p.id=c.portfolio_id
LEFT JOIN public.property_enrichment_queue q ON q.portfolio_client_id=c.id;

-- Candidate email associations, not contacts or household identity.
WITH x AS (
 SELECT c.*,COALESCE(o.is_test_account,false) AS test_org
 FROM public.lender_portfolio_clients c JOIN public.lender_portfolios p ON p.id=c.portfolio_id
 JOIN public.lender_orgs o ON o.id=p.lender_org_id
), g AS (
 SELECT test_org,portfolio_id,lower(trim(client_email)) email_key,count(*) n,
 count(DISTINCT lower(regexp_replace(trim(address_line1),'[.,]','','g')) || '|' ||
 left(regexp_replace(COALESCE(zip,''),'[^0-9]','','g'),5)) property_candidates
 FROM x WHERE nullif(trim(client_email),'') IS NOT NULL
 GROUP BY test_org,portfolio_id,lower(trim(client_email))
)
SELECT test_org,count(*) FILTER(WHERE property_candidates>1) AS multi_property_email_groups,
 COALESCE(sum(n) FILTER(WHERE property_candidates>1),0) AS implicated_rows FROM g GROUP BY test_org;