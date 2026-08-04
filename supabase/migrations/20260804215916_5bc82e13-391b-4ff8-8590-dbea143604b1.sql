-- Retire the dormant Fello integration; property data now comes solely from
-- the property records provider cached in public.property_intel.
DROP TABLE IF EXISTS public.fello_events;
DROP TABLE IF EXISTS public.fello_webhook_subscriptions;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS fello_contact_id,
  DROP COLUMN IF EXISTS fello_estimated_value_cents,
  DROP COLUMN IF EXISTS fello_equity_cents,
  DROP COLUMN IF EXISTS fello_lead_score,
  DROP COLUMN IF EXISTS fello_last_synced_at;

UPDATE public.lender_portfolios
  SET name = 'Client Roster · 76 Homeowners'
  WHERE name = 'Fello Import · 76 Homeowners';