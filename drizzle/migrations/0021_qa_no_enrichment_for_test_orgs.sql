CREATE OR REPLACE FUNCTION public.tg_enqueue_property_enrichment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.address_line1 IS NULL OR btrim(NEW.address_line1) = '' THEN RETURN NEW; END IF;
  -- Labeled QA workspaces never trigger paid property lookups.
  IF EXISTS (SELECT 1 FROM lender_portfolios p JOIN lender_orgs o ON o.id = p.lender_org_id
             WHERE p.id = NEW.portfolio_id AND o.is_test_account) THEN RETURN NEW; END IF;
  INSERT INTO public.property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
  VALUES (NEW.id, NEW.portfolio_id, CASE WHEN NEW.homeowner_id IS NOT NULL THEN 10 ELSE 50 END)
  ON CONFLICT (portfolio_client_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_requeue_on_address_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lender_portfolios p JOIN lender_orgs o ON o.id = p.lender_org_id
             WHERE p.id = NEW.portfolio_id AND o.is_test_account) THEN RETURN NEW; END IF;
  IF NEW.address_line1 IS DISTINCT FROM OLD.address_line1
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.zip IS DISTINCT FROM OLD.zip THEN
    INSERT INTO public.property_enrichment_queue (portfolio_client_id, portfolio_id, priority, status, attempts, next_attempt_at)
    VALUES (NEW.id, NEW.portfolio_id, CASE WHEN NEW.homeowner_id IS NOT NULL THEN 10 ELSE 50 END, 'pending', 0, now())
    ON CONFLICT (portfolio_client_id) DO UPDATE
      SET status = 'pending', attempts = 0, last_error = NULL,
          address_normalized = NULL, address_verified_at = NULL,
          next_attempt_at = now(), completed_at = NULL;
  END IF;
  RETURN NEW;
END; $$;