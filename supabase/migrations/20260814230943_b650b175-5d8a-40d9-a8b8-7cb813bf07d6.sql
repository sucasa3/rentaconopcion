-- 1. Per-address, per-record-class "no data" memory so we never re-buy a blank answer.
CREATE TABLE IF NOT EXISTS public.property_intel_misses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_normalized text NOT NULL,
  endpoint text NOT NULL,
  reason text NOT NULL,
  status integer,
  occurrences integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  suppressed_until timestamptz NOT NULL DEFAULT now() + interval '180 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address_normalized, endpoint)
);
GRANT ALL ON public.property_intel_misses TO service_role;
ALTER TABLE public.property_intel_misses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read record misses"
  ON public.property_intel_misses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_property_intel_misses_updated
  BEFORE UPDATE ON public.property_intel_misses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Which provider record classes we are entitled to call.
CREATE TABLE IF NOT EXISTS public.attom_endpoint_health (
  endpoint text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  unauthorized_count integer NOT NULL DEFAULT 0,
  last_unauthorized_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.attom_endpoint_health TO service_role;
GRANT SELECT ON public.attom_endpoint_health TO authenticated;
ALTER TABLE public.attom_endpoint_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read endpoint health"
  ON public.attom_endpoint_health FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_attom_endpoint_health_updated
  BEFORE UPDATE ON public.attom_endpoint_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.attom_endpoint_health (endpoint, enabled, note) VALUES
  ('detail',       true,  'Core: property profile'),
  ('avm',          true,  'Core: automated valuation'),
  ('permits',      true,  'Strategic refresh'),
  ('mortgage',     false, 'Disabled until provider confirms entitlement (401s)'),
  ('sales',        false, 'Disabled until provider confirms entitlement (401s)'),
  ('tax',          true,  'Conditional / on-demand only'),
  ('owner',        true,  'Conditional / on-demand only'),
  ('neighborhood', true,  'Conditional / on-demand only'),
  ('risk',         true,  'Conditional / on-demand only')
ON CONFLICT (endpoint) DO NOTHING;

-- 3. Queue: remember the canonical address a row resolved to, so several
--    client rows pointing at the same home share one Home Profile pull.
ALTER TABLE public.property_enrichment_queue
  ADD COLUMN IF NOT EXISTS address_normalized text,
  ADD COLUMN IF NOT EXISTS address_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_peq_status_next
  ON public.property_enrichment_queue (status, priority, next_attempt_at);

-- 4. Re-queue a client whenever its address is added or corrected.
CREATE OR REPLACE FUNCTION public.tg_requeue_on_address_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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
END;
$$;

DROP TRIGGER IF EXISTS trg_requeue_on_address_change ON public.lender_portfolio_clients;
CREATE TRIGGER trg_requeue_on_address_change
  AFTER UPDATE ON public.lender_portfolio_clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_requeue_on_address_change();

-- 5. Continuous background drain: every 2 minutes, larger batches.
SELECT cron.unschedule('property-enrichment-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'property-enrichment-tick');
SELECT cron.schedule(
  'property-enrichment-tick',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--94429f0c-1687-4b34-81a7-6195279589c3.lovable.app/api/public/enrich/tick',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_dvSA_Juhtj_ETiv5x_iPxQ_mr3rRu-M"}'::jsonb,
    body := '{"batchSize": 25}'::jsonb
  );
  $$
);