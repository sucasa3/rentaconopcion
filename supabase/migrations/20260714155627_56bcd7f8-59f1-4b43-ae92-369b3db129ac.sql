
-- === EXTEND EXISTING TABLES ===
ALTER TABLE public.pros
  ADD COLUMN IF NOT EXISTS is_founding_partner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_price_cents integer NOT NULL DEFAULT 39700,
  ADD COLUMN IF NOT EXISTS accepting_leads boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS routing_status text NOT NULL DEFAULT 'unrouted';

-- === PRO COVERAGE ===
CREATE TABLE IF NOT EXISTS public.pro_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  category text NOT NULL,
  zip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pro_id, category, zip)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_coverage TO authenticated;
GRANT ALL ON public.pro_coverage TO service_role;
ALTER TABLE public.pro_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pros manage own coverage" ON public.pro_coverage
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pros p WHERE p.id = pro_coverage.pro_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pros p WHERE p.id = pro_coverage.pro_id AND p.user_id = auth.uid()));
CREATE POLICY "admin manage coverage" ON public.pro_coverage
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS pro_coverage_cat_zip_idx ON public.pro_coverage(category, zip);

-- === LEAD OFFERS ===
CREATE TABLE IF NOT EXISTS public.lead_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  pro_id uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending', -- pending|accepted|declined|expired|cancelled
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '25 minutes'),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_request_id, pro_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_offers TO authenticated;
GRANT ALL ON public.lead_offers TO service_role;
ALTER TABLE public.lead_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pros see own offers" ON public.lead_offers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pros p WHERE p.id = lead_offers.pro_id AND p.user_id = auth.uid()));
CREATE POLICY "pros update own offers" ON public.lead_offers
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pros p WHERE p.id = lead_offers.pro_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pros p WHERE p.id = lead_offers.pro_id AND p.user_id = auth.uid()));
CREATE POLICY "admin manage offers" ON public.lead_offers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS lead_offers_pending_idx ON public.lead_offers(status, expires_at);
CREATE INDEX IF NOT EXISTS lead_offers_pro_idx ON public.lead_offers(pro_id, status);

-- === LEAD ASSIGNMENTS ===
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE CASCADE,
  pro_id uuid NOT NULL REFERENCES public.pros(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  ghl_opportunity_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_assignments TO authenticated;
GRANT ALL ON public.lead_assignments TO service_role;
ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pros see own assignments" ON public.lead_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pros p WHERE p.id = lead_assignments.pro_id AND p.user_id = auth.uid()));
CREATE POLICY "homeowner sees own assignment" ON public.lead_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.service_requests sr
     WHERE sr.id = lead_assignments.service_request_id AND sr.homeowner_id = auth.uid()
  ));
CREATE POLICY "admin manage assignments" ON public.lead_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === ROUND-ROBIN CURSOR ===
CREATE TABLE IF NOT EXISTS public.rr_cursor (
  category text NOT NULL,
  zip text NOT NULL,
  last_pro_id uuid REFERENCES public.pros(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category, zip)
);
GRANT SELECT ON public.rr_cursor TO authenticated;
GRANT ALL ON public.rr_cursor TO service_role;
ALTER TABLE public.rr_cursor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage cursor" ON public.rr_cursor
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === UPDATED_AT TRIGGERS ===
CREATE TRIGGER trg_lead_offers_updated_at BEFORE UPDATE ON public.lead_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lead_assignments_updated_at BEFORE UPDATE ON public.lead_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === ROUTING TRIGGER ON service_requests ===
CREATE OR REPLACE FUNCTION public.tg_enqueue_lead_routing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source = 'homeowner' OR NEW.source = 'app' THEN
    NEW.routing_status := 'unrouted';
    INSERT INTO public.ghl_sync_queue (entity_type, entity_id, op)
      VALUES ('lead_route', NEW.id, 'upsert');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enqueue_lead_routing ON public.service_requests;
CREATE TRIGGER trg_enqueue_lead_routing
  BEFORE INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_lead_routing();
