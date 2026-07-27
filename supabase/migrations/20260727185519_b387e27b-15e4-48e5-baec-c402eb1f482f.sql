
CREATE OR REPLACE FUNCTION public.is_request_homeowner(_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE id = _request_id AND homeowner_id = _user_id
  )
$$;

DROP POLICY IF EXISTS "homeowner sees own assignment" ON public.lead_assignments;
CREATE POLICY "homeowner sees own assignment"
ON public.lead_assignments
FOR SELECT
USING (public.is_request_homeowner(service_request_id, auth.uid()));
