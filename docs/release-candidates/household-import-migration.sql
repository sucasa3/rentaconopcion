-- REVIEW ONLY. NOT APPLIED. Multi-property lossless import (additive).
-- No existing column, row, policy or trigger semantics change except that
-- tg_enqueue_property_enrichment honors a transaction-local intake hold that
-- only import_household_batch sets. Without that setting behavior is identical.

-- 1. Contacts per book (identity is never global).
CREATE TABLE public.book_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.lender_portfolios(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  source_client_id uuid UNIQUE,           -- backfilled from an existing client row
  created_batch_id uuid,                  -- null for backfill
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX book_contacts_book_idx ON public.book_contacts(book_id);

-- 2. Contact <-> property links. role is never "co_borrower" by inference.
CREATE TABLE public.client_contact_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.lender_portfolios(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.book_contacts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('primary','associated')),
  created_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, client_id)
);
CREATE INDEX client_contact_links_client_idx ON public.client_contact_links(client_id);

-- 3. Property keys (unit-aware street + ZIP5, computed by the app) — prevents
-- duplicate properties under concurrent or repeated imports.
CREATE TABLE public.book_property_keys (
  book_id uuid NOT NULL REFERENCES public.lender_portfolios(id) ON DELETE CASCADE,
  property_key text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, property_key)
);

-- 4. Lossless staging / batch evidence.
CREATE TABLE public.contact_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.lender_portfolios(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  file_sha256 text NOT NULL,
  total_rows integer NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  enrichment_hold boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contact_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.contact_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw jsonb NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('invalid_address','suppressed','exact_duplicate','existing_property',
    'new_property','additional_contact','needs_review','waiting_for_capacity')),
  reason text,
  client_id uuid,
  contact_id uuid,
  UNIQUE (batch_id, row_number)
);

-- 5. Server-side enrichment hold for imported properties.
CREATE TABLE public.enrichment_intake_holds (
  client_id uuid PRIMARY KEY REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.contact_import_batches(id) ON DELETE CASCADE,
  held_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid
);

GRANT SELECT ON public.book_contacts, public.client_contact_links, public.contact_import_batches,
  public.contact_import_rows, public.enrichment_intake_holds TO authenticated;
GRANT ALL ON public.book_contacts, public.client_contact_links, public.book_property_keys,
  public.contact_import_batches, public.contact_import_rows, public.enrichment_intake_holds TO service_role;

ALTER TABLE public.book_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_property_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_intake_holds ENABLE ROW LEVEL SECURITY;

-- Read-only for whoever can already see the book (lender_portfolios RLS applies
-- inside the subquery). All writes go through the service-role RPC below.
CREATE POLICY book_contacts_read ON public.book_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lender_portfolios p WHERE p.id = book_id));
CREATE POLICY client_contact_links_read ON public.client_contact_links FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lender_portfolios p WHERE p.id = book_id));
CREATE POLICY contact_import_batches_read ON public.contact_import_batches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lender_portfolios p WHERE p.id = book_id));
CREATE POLICY contact_import_rows_read ON public.contact_import_rows FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contact_import_batches b JOIN public.lender_portfolios p ON p.id = b.book_id WHERE b.id = batch_id));
CREATE POLICY enrichment_intake_holds_read ON public.enrichment_intake_holds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lender_portfolio_clients c JOIN public.lender_portfolios p ON p.id = c.portfolio_id WHERE c.id = client_id));

-- 6. Backfill: one primary contact per existing client (no existing row changes).
INSERT INTO public.book_contacts (book_id, full_name, email, phone, source_client_id)
SELECT c.portfolio_id, coalesce(nullif(btrim(c.client_name), ''), 'Homeowner'), c.client_email, c.client_phone, c.id
FROM public.lender_portfolio_clients c
ON CONFLICT (source_client_id) DO NOTHING;
INSERT INTO public.client_contact_links (book_id, contact_id, client_id, role)
SELECT k.book_id, k.id, k.source_client_id, 'primary'
FROM public.book_contacts k WHERE k.source_client_id IS NOT NULL
ON CONFLICT (contact_id, client_id) DO NOTHING;

-- 7. Enqueue trigger: identical unless the importer's transaction-local hold is set.
CREATE OR REPLACE FUNCTION public.tg_enqueue_property_enrichment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _hold text := current_setting('sucasa.intake_hold', true);
BEGIN
  IF NEW.address_line1 IS NULL OR btrim(NEW.address_line1) = '' THEN RETURN NEW; END IF;
  IF _hold IS NOT NULL AND _hold <> '' THEN
    INSERT INTO public.enrichment_intake_holds (client_id, batch_id)
    VALUES (NEW.id, _hold::uuid) ON CONFLICT (client_id) DO NOTHING;
    RETURN NEW;
  END IF;
  INSERT INTO public.property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
  VALUES (NEW.id, NEW.portfolio_id, CASE WHEN NEW.homeowner_id IS NOT NULL THEN 10 ELSE 50 END)
  ON CONFLICT (portfolio_client_id) DO NOTHING;
  RETURN NEW;
END $$;

-- 8. Atomic batch import. The app supplies the plan (row outcomes, property keys,
-- contact refs) computed by src/lib/household-import.ts; this function locks the
-- book, re-checks property keys, and writes everything in one transaction.
-- p_rows: [{row_number, raw, outcome, reason, property_key, property_ref, contact_ref, role, client}]
-- p_existing_keys: [{property_key, client_id}] for the book's current clients.
CREATE OR REPLACE FUNCTION public.import_household_batch(
  p_book uuid, p_actor uuid, p_file_sha256 text, p_rows jsonb, p_existing_keys jsonb, p_new_capacity integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _batch uuid; _r jsonb; _client uuid; _contact uuid; _outcome text;
  _props jsonb := '{}'::jsonb; _contacts jsonb := '{}'::jsonb; _inserted int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('household_import:' || p_book::text));
  INSERT INTO public.book_property_keys (book_id, property_key, client_id)
  SELECT p_book, e->>'property_key', (e->>'client_id')::uuid FROM jsonb_array_elements(p_existing_keys) e
  JOIN public.lender_portfolio_clients c ON c.id = (e->>'client_id')::uuid AND c.portfolio_id = p_book
  ON CONFLICT DO NOTHING;

  INSERT INTO public.contact_import_batches (book_id, created_by, file_sha256, total_rows)
  VALUES (p_book, p_actor, p_file_sha256, jsonb_array_length(p_rows)) RETURNING id INTO _batch;
  PERFORM set_config('sucasa.intake_hold', _batch::text, true);

  FOR _r IN SELECT * FROM jsonb_array_elements(p_rows) ORDER BY (value->>'row_number')::int LOOP
    _outcome := _r->>'outcome'; _client := NULL; _contact := NULL;
    IF _outcome IN ('new_property','existing_property','additional_contact') THEN
      -- Resolve property.
      IF _props ? (_r->>'property_ref') THEN
        _client := (_props->>(_r->>'property_ref'))::uuid;
      ELSIF (_r->>'property_ref') NOT LIKE 'new:%' THEN
        SELECT id INTO _client FROM public.lender_portfolio_clients
          WHERE id = (_r->>'property_ref')::uuid AND portfolio_id = p_book;
        IF _client IS NULL THEN RAISE EXCEPTION 'property not in book'; END IF;
      ELSE
        SELECT client_id INTO _client FROM public.book_property_keys
          WHERE book_id = p_book AND property_key = _r->>'property_key';
        IF _client IS NULL THEN
          IF _inserted >= p_new_capacity THEN
            _outcome := 'waiting_for_capacity';
          ELSE
            INSERT INTO public.lender_portfolio_clients (portfolio_id, client_name, client_email, client_phone,
              address_line1, city, state, zip, loan_amount_at_close_cents, rate_at_close, notes)
            SELECT p_book, c->>'client_name', c->>'client_email', c->>'client_phone', c->>'address_line1',
              c->>'city', c->>'state', c->>'zip', (c->>'loan_amount_at_close_cents')::bigint,
              (c->>'rate_at_close')::numeric, c->>'notes'
            FROM (SELECT _r->'client' AS c) s RETURNING id INTO _client;
            INSERT INTO public.book_property_keys VALUES (p_book, _r->>'property_key', _client);
            _inserted := _inserted + 1;
          END IF;
        ELSE
          _outcome := 'existing_property';
        END IF;
      END IF;
      IF _client IS NOT NULL THEN
        _props := _props || jsonb_build_object(_r->>'property_ref', _client);
        -- Resolve contact.
        IF _contacts ? (_r->>'contact_ref') THEN
          _contact := (_contacts->>(_r->>'contact_ref'))::uuid;
        ELSIF (_r->>'contact_ref') NOT LIKE 'new:%' THEN
          SELECT id INTO _contact FROM public.book_contacts WHERE id = (_r->>'contact_ref')::uuid AND book_id = p_book;
          IF _contact IS NULL THEN RAISE EXCEPTION 'contact not in book'; END IF;
        ELSE
          INSERT INTO public.book_contacts (book_id, full_name, email, phone, created_batch_id)
          VALUES (p_book, _r->'client'->>'client_name', _r->'client'->>'client_email', _r->'client'->>'client_phone', _batch)
          RETURNING id INTO _contact;
        END IF;
        _contacts := _contacts || jsonb_build_object(_r->>'contact_ref', _contact);
        INSERT INTO public.client_contact_links (book_id, contact_id, client_id, role, created_batch_id)
        VALUES (p_book, _contact, _client, coalesce(_r->>'role','associated'), _batch)
        ON CONFLICT (contact_id, client_id) DO NOTHING;
      END IF;
    END IF;
    INSERT INTO public.contact_import_rows (batch_id, row_number, raw, outcome, reason, client_id, contact_id)
    VALUES (_batch, (_r->>'row_number')::int, _r->'raw', _outcome, _r->>'reason', _client, _contact);
  END LOOP;

  UPDATE public.contact_import_batches b SET counts = (
    SELECT jsonb_object_agg(outcome, n) FROM (SELECT outcome, count(*) n FROM public.contact_import_rows
      WHERE batch_id = _batch GROUP BY outcome) s) WHERE b.id = _batch;
  RETURN jsonb_build_object('batch_id', _batch, 'inserted', _inserted,
    'counts', (SELECT counts FROM public.contact_import_batches WHERE id = _batch));
END $$;

-- 9. Explicit operator release of a hold (no automatic dispatch).
CREATE OR REPLACE FUNCTION public.release_intake_hold(p_batch uuid, p_actor uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n int;
BEGIN
  INSERT INTO public.property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
  SELECT h.client_id, c.portfolio_id, 50 FROM public.enrichment_intake_holds h
  JOIN public.lender_portfolio_clients c ON c.id = h.client_id
  WHERE h.batch_id = p_batch AND h.released_at IS NULL
  ON CONFLICT (portfolio_client_id) DO NOTHING;
  UPDATE public.enrichment_intake_holds SET released_at = now(), released_by = p_actor
  WHERE batch_id = p_batch AND released_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.import_household_batch(uuid, uuid, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_intake_hold(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_household_batch(uuid, uuid, text, jsonb, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_intake_hold(uuid, uuid) TO service_role;
