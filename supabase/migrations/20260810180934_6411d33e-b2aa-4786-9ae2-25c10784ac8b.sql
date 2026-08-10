REVOKE ALL ON FUNCTION public.tg_guard_introduction_response() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_guard_campaign_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_enforce_sponsor_allocation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.portfolio_client_org(uuid) FROM PUBLIC, anon, authenticated;