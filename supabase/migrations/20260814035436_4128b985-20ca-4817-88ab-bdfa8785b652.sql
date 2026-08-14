CREATE TABLE public.property_enrichment_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_client_id uuid NOT NULL UNIQUE REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.lender_portfolios(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_result text,
  next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  requested_classes text[] NOT NULL DEFAULT ARRAY['detail','tax','sales','mortgage','avm']::text[],
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT property_enrichment_queue_status_check
    CHECK (status IN ('pending','running','done','failed','needs_review','skipped'))
);

GRANT SELECT ON public.property_enrichment_queue TO authenticated;
GRANT ALL ON public.property_enrichment_queue TO service_role;

ALTER TABLE public.property_enrichment_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read their book's enrichment queue"
ON public.property_enrichment_queue
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.lender_portfolios p
    JOIN public.lender_members m ON m.lender_org_id = p.lender_org_id
    WHERE p.id = property_enrichment_queue.portfolio_id
      AND m.user_id = auth.uid()
  )
);

CREATE INDEX idx_peq_ready
  ON public.property_enrichment_queue (status, priority, next_attempt_at);
CREATE INDEX idx_peq_portfolio
  ON public.property_enrichment_queue (portfolio_id, status);

CREATE TRIGGER trg_peq_updated
BEFORE UPDATE ON public.property_enrichment_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-enqueue newly added portfolio clients.
CREATE OR REPLACE FUNCTION public.tg_enqueue_property_enrichment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.address_line1 IS NULL OR btrim(NEW.address_line1) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
  VALUES (
    NEW.id,
    NEW.portfolio_id,
    CASE WHEN NEW.homeowner_id IS NOT NULL THEN 10 ELSE 50 END
  )
  ON CONFLICT (portfolio_client_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enqueue_property_enrichment
AFTER INSERT ON public.lender_portfolio_clients
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_property_enrichment();

-- Backfill: queue every existing client that has an address, activated first.
INSERT INTO public.property_enrichment_queue (portfolio_client_id, portfolio_id, priority)
SELECT c.id,
       c.portfolio_id,
       CASE WHEN c.homeowner_id IS NOT NULL THEN 10 ELSE 50 END
FROM public.lender_portfolio_clients c
WHERE c.address_line1 IS NOT NULL
  AND btrim(c.address_line1) <> ''
ON CONFLICT (portfolio_client_id) DO NOTHING;