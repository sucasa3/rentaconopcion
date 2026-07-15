
-- 1) pros: restrict signed-in browse to a safe view
DROP POLICY IF EXISTS "Signed-in can view active pros" ON public.pros;

CREATE OR REPLACE VIEW public.pros_directory
WITH (security_invoker = true) AS
SELECT id, business_name, category, service_area, active, rating,
       reviews_count, is_founding_partner, plan, accepting_leads, created_at
FROM public.pros
WHERE active = true;

GRANT SELECT ON public.pros_directory TO authenticated, anon;

-- Owner + admin policies already exist; add a narrow policy so pros_directory (security_invoker)
-- can read the underlying rows for signed-in users, limited implicitly to active=true via view.
CREATE POLICY "Signed-in can view active pros (directory only)"
  ON public.pros FOR SELECT
  TO authenticated
  USING (active = true);
-- NOTE: The view enforces column restriction; direct table access still returns all columns
-- for the owner (via "Pros manage own record") and admins. To fully hide sensitive columns
-- from non-owners, revoke column-level SELECT on sensitive columns from authenticated.
REVOKE SELECT (email, phone, monthly_price_cents, claimed_count, user_id) ON public.pros FROM authenticated;
GRANT SELECT (id, business_name, category, service_area, active, rating, reviews_count,
              is_founding_partner, plan, accepting_leads, created_at, updated_at)
  ON public.pros TO authenticated;
-- Owners/admins access sensitive fields via service_role in server functions (already the pattern).

-- 2) service_requests: replace broad "Pros can view open requests"
DROP POLICY IF EXISTS "Pros can view open requests" ON public.service_requests;

CREATE POLICY "Pros view only offered or assigned requests"
  ON public.service_requests FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'pro'::app_role)
    AND (
      EXISTS (
        SELECT 1 FROM public.lead_offers lo
        JOIN public.pros p ON p.id = lo.pro_id
        WHERE lo.service_request_id = service_requests.id
          AND p.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.lead_assignments la
        JOIN public.pros p ON p.id = la.pro_id
        WHERE la.service_request_id = service_requests.id
          AND p.user_id = auth.uid()
      )
    )
  );

-- 3) ghl_sync_queue: explicit deny for authenticated writes (belt-and-suspenders)
CREATE POLICY "Block authenticated inserts"
  ON public.ghl_sync_queue AS RESTRICTIVE FOR INSERT
  TO authenticated WITH CHECK (false);
CREATE POLICY "Block authenticated updates"
  ON public.ghl_sync_queue AS RESTRICTIVE FOR UPDATE
  TO authenticated USING (false);
CREATE POLICY "Block authenticated deletes"
  ON public.ghl_sync_queue AS RESTRICTIVE FOR DELETE
  TO authenticated USING (false);

-- 4) SECURITY DEFINER functions: revoke execute from public/anon; keep only what's needed
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enqueue_ghl_sync(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ghl_sync(text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.compute_lifecycle_stage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_lifecycle_stage(uuid) TO service_role;

-- Trigger functions: not callable directly except by triggers; revoke from clients
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_enqueue_profile_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_enqueue_pro_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_enqueue_request_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_enqueue_claim_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_refresh_lifecycle_stage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_enqueue_lead_routing() FROM PUBLIC, anon, authenticated;
