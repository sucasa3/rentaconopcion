ALTER TABLE public.campaign_sends
  ADD COLUMN IF NOT EXISTS crm_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS crm_error text;

UPDATE public.campaign_sends
SET crm_status = 'failed', crm_error = error_message
WHERE status = 'failed' AND error_message ILIKE 'GHL %';

UPDATE public.campaign_sends
SET status = 'queued'
WHERE status = 'failed' AND crm_status = 'failed';