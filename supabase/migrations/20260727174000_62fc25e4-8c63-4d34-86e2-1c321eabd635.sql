
REVOKE EXECUTE ON FUNCTION public.is_lender_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_lender_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
