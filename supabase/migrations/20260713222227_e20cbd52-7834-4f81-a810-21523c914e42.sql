
-- Queue of pending GHL sync operations
CREATE TABLE public.ghl_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('homeowner','pro','service_request','claim')),
  entity_id uuid NOT NULL,
  op text NOT NULL CHECK (op IN ('upsert','delete')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ghl_sync_queue TO service_role;
GRANT SELECT ON public.ghl_sync_queue TO authenticated;
ALTER TABLE public.ghl_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view queue" ON public.ghl_sync_queue
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ghl_sync_queue_pending ON public.ghl_sync_queue (created_at)
  WHERE processed_at IS NULL;

CREATE TRIGGER trg_ghl_sync_queue_updated
  BEFORE UPDATE ON public.ghl_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mapping between SuCasa rows and GHL objects
CREATE TABLE public.ghl_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  ghl_contact_id text,
  ghl_opportunity_id text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

GRANT ALL ON public.ghl_sync_state TO service_role;
GRANT SELECT ON public.ghl_sync_state TO authenticated;
ALTER TABLE public.ghl_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync state" ON public.ghl_sync_state
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ghl_sync_state_updated
  BEFORE UPDATE ON public.ghl_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enqueue helper
CREATE OR REPLACE FUNCTION public.enqueue_ghl_sync(
  _entity_type text,
  _entity_id uuid,
  _op text DEFAULT 'upsert'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ghl_sync_queue (entity_type, entity_id, op)
  VALUES (_entity_type, _entity_id, _op);
END;
$$;

-- Triggers on source tables
CREATE OR REPLACE FUNCTION public.tg_enqueue_profile_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_ghl_sync('homeowner', NEW.id, 'upsert');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_profiles_ghl_sync
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_profile_sync();

CREATE OR REPLACE FUNCTION public.tg_enqueue_pro_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_ghl_sync('pro', NEW.id, 'upsert');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_pros_ghl_sync
  AFTER INSERT OR UPDATE ON public.pros
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_pro_sync();

CREATE OR REPLACE FUNCTION public.tg_enqueue_request_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_ghl_sync('service_request', NEW.id, 'upsert');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_requests_ghl_sync
  AFTER INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_request_sync();

CREATE OR REPLACE FUNCTION public.tg_enqueue_claim_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_ghl_sync('claim', NEW.id, 'upsert');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_claims_ghl_sync
  AFTER INSERT OR UPDATE ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_claim_sync();
