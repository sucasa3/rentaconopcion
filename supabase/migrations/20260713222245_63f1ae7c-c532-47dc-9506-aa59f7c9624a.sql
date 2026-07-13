
REVOKE EXECUTE ON FUNCTION public.enqueue_ghl_sync(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_profile_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_pro_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_request_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_enqueue_claim_sync() FROM PUBLIC, anon, authenticated;
