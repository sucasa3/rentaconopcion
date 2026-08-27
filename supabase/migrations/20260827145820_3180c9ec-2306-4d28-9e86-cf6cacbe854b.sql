UPDATE public.data_provider_health
SET enabled = true, updated_at = now()
WHERE provider = 'batchdata';

-- Ensure ATTOM endpoints remain disabled until entitlement is restored.
UPDATE public.data_provider_health
SET enabled = false, updated_at = now()
WHERE provider = 'attom';