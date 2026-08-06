CREATE POLICY "Org members read their partner logo"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'partner-logos'
  AND EXISTS (
    SELECT 1 FROM public.lender_members m
    WHERE m.user_id = auth.uid()
      AND m.lender_org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Org members upload their partner logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'partner-logos'
  AND EXISTS (
    SELECT 1 FROM public.lender_members m
    WHERE m.user_id = auth.uid()
      AND m.lender_org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Org members update their partner logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'partner-logos'
  AND EXISTS (
    SELECT 1 FROM public.lender_members m
    WHERE m.user_id = auth.uid()
      AND m.lender_org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Org members delete their partner logo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'partner-logos'
  AND EXISTS (
    SELECT 1 FROM public.lender_members m
    WHERE m.user_id = auth.uid()
      AND m.lender_org_id::text = (storage.foldername(name))[1]
  )
);