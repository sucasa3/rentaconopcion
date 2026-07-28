
CREATE OR REPLACE FUNCTION public.is_request_assigned_pro(_request_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lead_assignments la
    JOIN public.pros p ON p.id = la.pro_id
    WHERE la.service_request_id = _request_id AND p.user_id = _user_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_request_assigned_pro(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_request_assigned_pro(uuid, uuid) TO authenticated;
