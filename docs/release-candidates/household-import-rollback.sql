-- REVIEW ONLY. NOT APPLIED. Database rollback for household-import-migration.sql (v2).
-- Order matters. This is NOT a purge: imported homes, contacts, links, staged
-- rows and holds are kept as evidence. Nothing here releases a held lookup.
--
-- Step 0 (app, always first): set HOUSEHOLD_IMPORT_ENABLED = false and publish.
--   Effect: CSV upload returns to the legacy importer; owner grouping disappears
--   (flat list); releaseImportHold refuses. withoutHeldClients and the queue
--   guard below keep filtering held homes regardless of the flag.
--
-- Step 1 (database, only if the importer function itself must be retired):

-- 1a. Stop new batch imports and releases.
REVOKE EXECUTE ON FUNCTION public.import_household_batch(uuid, uuid, text, jsonb, jsonb, integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.release_intake_hold(uuid, uuid) FROM service_role;

-- 1b. Restore the original enqueue trigger body (exact production text).
CREATE OR REPLACE FUNCTION public.tg_enqueue_property_enrichment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.address_line1 IS NULL OR btrim(NEW.address_line1) = '' THEN RETURN NEW; END IF;
  INSERT INTO public.property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
  VALUES (NEW.id, NEW.portfolio_id, CASE WHEN NEW.homeowner_id IS NOT NULL THEN 10 ELSE 50 END)
  ON CONFLICT (portfolio_client_id) DO NOTHING;
  RETURN NEW;
END $$;

-- KEEP trg_block_held_enrichment and enrichment_intake_holds. Dropping either
-- would let the next "Enrich" / "Retry" / Discovery pass queue held homes.
-- Held homes are released only by an explicit, reviewed decision, e.g.:
--   GRANT EXECUTE ON FUNCTION public.release_intake_hold(uuid, uuid) TO service_role;
--   SELECT public.release_intake_hold('<batch>', '<actor>');
--
-- Capacity: imported homes are real active clients and keep counting toward
-- the organization's Home Profile capacity after any rollback. Capacity is
-- returned only by archiving specific homes through the existing archive flow.
-- Waiting-for-capacity rows were never inserted and use no capacity.
