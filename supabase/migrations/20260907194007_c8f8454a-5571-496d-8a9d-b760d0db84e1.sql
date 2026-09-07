-- 1) platform_config: internal settings should not be readable by every signed-in user.
DROP POLICY IF EXISTS "Signed-in users read config" ON public.platform_config;

CREATE POLICY "Admins read config"
  ON public.platform_config
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) addon_products: keep the pricing catalog readable, but only active rows,
--    and never expose Stripe price identifiers to client roles.
DROP POLICY IF EXISTS addon_products_read ON public.addon_products;

CREATE POLICY addon_products_read
  ON public.addon_products
  FOR SELECT
  TO authenticated
  USING (active = true OR has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT ON public.addon_products FROM authenticated;
GRANT SELECT (key, name, audience, kind, unit_quantity, price_cents, sort_order, active, created_at, updated_at)
  ON public.addon_products TO authenticated;
GRANT ALL ON public.addon_products TO service_role;