GRANT SELECT ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_activations TO authenticated;
GRANT ALL ON public.campaign_activations TO service_role;

GRANT SELECT ON public.campaign_sends TO authenticated;
GRANT ALL ON public.campaign_sends TO service_role;