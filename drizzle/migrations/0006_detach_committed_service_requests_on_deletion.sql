-- Allow an accepted service request to survive account deletion, detached from
-- the deleted SuCasa account, so an obligation already accepted by an
-- independent provider is not silently cancelled or erased.
ALTER TABLE public.service_requests
  ALTER COLUMN homeowner_id DROP NOT NULL;

ALTER TABLE public.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_homeowner_id_fkey;

ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_homeowner_id_fkey
  FOREIGN KEY (homeowner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.service_requests.homeowner_id IS
  'Null means the requesting SuCasa account was deleted; the row remains only as the minimum record of a transaction already accepted by an independent provider.';