REVOKE EXECUTE ON FUNCTION public.business_funnel(uuid, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.business_funnel(uuid, timestamptz) TO authenticated, service_role;