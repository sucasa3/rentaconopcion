
-- Add fields for external service logs
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sucasa',
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS amount_cents integer,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS receipt_path text;

ALTER TABLE public.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_source_check;
ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_source_check CHECK (source IN ('sucasa','external'));

-- RLS on receipts storage (bucket created via storage tool)
CREATE POLICY "Homeowners read own receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'service-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Homeowners upload own receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'service-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Homeowners update own receipts"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'service-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Homeowners delete own receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'service-receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins manage all receipts"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'service-receipts' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'service-receipts' AND public.has_role(auth.uid(), 'admin'::app_role));
