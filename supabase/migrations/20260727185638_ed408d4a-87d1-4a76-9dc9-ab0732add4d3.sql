
GRANT EXECUTE ON FUNCTION public.is_lender_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_lender_access(uuid, uuid) TO authenticated, service_role;
