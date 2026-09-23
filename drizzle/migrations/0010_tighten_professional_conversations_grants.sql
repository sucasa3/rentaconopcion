REVOKE ALL ON public.professional_conversations FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.professional_conversations FROM authenticated;
GRANT SELECT, INSERT ON public.professional_conversations TO authenticated;
GRANT ALL ON public.professional_conversations TO service_role;