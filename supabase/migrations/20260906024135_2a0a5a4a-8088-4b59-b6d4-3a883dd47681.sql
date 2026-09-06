REVOKE EXECUTE ON FUNCTION public.org_active_profile_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.org_profile_capacity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_active_profile_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_profile_capacity(uuid) TO service_role;