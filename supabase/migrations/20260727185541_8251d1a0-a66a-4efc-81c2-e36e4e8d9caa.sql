
REVOKE EXECUTE ON FUNCTION public.is_request_homeowner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_request_homeowner(uuid, uuid) TO authenticated, service_role;
