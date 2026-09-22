-- A user-editable address string is not proof of entitlement to a property
-- record. Direct client reads of raw provider records are denied; all product
-- reads go through server code that authorizes the caller against
-- server-controlled records (own home profile, or org membership + consent).
DROP POLICY IF EXISTS "Homeowners view intel for their own address" ON public.property_intel;

CREATE POLICY "Only admins read raw property records"
  ON public.property_intel
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));