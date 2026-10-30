REVOKE ALL ON public.upload_reverse_searches FROM anon, authenticated;
REVOKE ALL ON public.upload_reverse_properties FROM anon, authenticated;
GRANT SELECT ON public.upload_reverse_searches TO authenticated;
GRANT SELECT ON public.upload_reverse_properties TO authenticated;