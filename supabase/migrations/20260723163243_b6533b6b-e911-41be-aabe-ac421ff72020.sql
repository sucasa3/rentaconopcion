
-- 1) has_role: switch to SECURITY INVOKER (users can already read own roles via existing policy)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2) Admin-only write policies for tables previously lacking write policies
CREATE POLICY "Admins manage attom_call_log"
  ON public.attom_call_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage attom_monthly_budget"
  ON public.attom_monthly_budget
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage fello_webhook_subscriptions"
  ON public.fello_webhook_subscriptions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage ghl_sync_state"
  ON public.ghl_sync_state
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Pros directory contact exposure: drop broad SELECT policy on public.pros;
--    signed-in users read the sanitized public.pros_directory view instead.
DROP POLICY IF EXISTS "Signed-in can view active pros (directory only)" ON public.pros;

GRANT SELECT ON public.pros_directory TO authenticated;
