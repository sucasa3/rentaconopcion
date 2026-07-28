
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_path text,
  ADD COLUMN IF NOT EXISTS invoice_cents integer,
  ADD COLUMN IF NOT EXISTS pro_notes text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION public.is_request_assigned_pro(_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead_assignments la
    JOIN public.pros p ON p.id = la.pro_id
    WHERE la.service_request_id = _request_id AND p.user_id = _user_id
  )
$$;

DROP POLICY IF EXISTS "Assigned pro can read request" ON public.service_requests;
CREATE POLICY "Assigned pro can read request"
  ON public.service_requests FOR SELECT
  TO authenticated
  USING (public.is_request_assigned_pro(id, auth.uid()));

DROP POLICY IF EXISTS "Assigned pro can update lifecycle" ON public.service_requests;
CREATE POLICY "Assigned pro can update lifecycle"
  ON public.service_requests FOR UPDATE
  TO authenticated
  USING (public.is_request_assigned_pro(id, auth.uid()))
  WITH CHECK (public.is_request_assigned_pro(id, auth.uid()));

DROP POLICY IF EXISTS "Pro can upload own invoice" ON storage.objects;
CREATE POLICY "Pro can upload own invoice"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-invoices' AND (auth.uid()::text = (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "Pro can read own invoice" ON storage.objects;
CREATE POLICY "Pro can read own invoice"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'service-invoices' AND (auth.uid()::text = (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "Homeowner can read invoice on own request" ON storage.objects;
CREATE POLICY "Homeowner can read invoice on own request"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'service-invoices'
    AND EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.invoice_path = storage.objects.name
        AND sr.homeowner_id = auth.uid()
    )
  );
