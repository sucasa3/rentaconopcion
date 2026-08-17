ALTER TABLE public.attom_call_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.attom_call_log FROM anon, authenticated;
GRANT SELECT ON public.attom_call_log TO authenticated;
GRANT ALL ON public.attom_call_log TO service_role;

DROP POLICY IF EXISTS "Admins manage attom_call_log" ON public.attom_call_log;
DROP POLICY IF EXISTS "Admins view all call logs" ON public.attom_call_log;

CREATE POLICY "Admins view attom_call_log"
ON public.attom_call_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));