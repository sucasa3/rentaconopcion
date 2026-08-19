CREATE TABLE public.lender_member_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sender_name text,
  reply_to_email text,
  contact_name text,
  contact_title text,
  contact_phone text,
  license_number text,
  logo_url text,
  signoff text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lender_org_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_member_profiles TO authenticated;
GRANT ALL ON public.lender_member_profiles TO service_role;

ALTER TABLE public.lender_member_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_lender_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lender_members
    WHERE user_id = _user_id AND lender_org_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_lender_manager(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lender_members
    WHERE user_id = _user_id AND lender_org_id = _org_id
      AND role IN ('owner','admin','manager')
  )
$$;

CREATE POLICY "Members read identities in their org"
ON public.lender_member_profiles FOR SELECT TO authenticated
USING (
  public.is_lender_member(auth.uid(), lender_org_id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Members write their own identity"
ON public.lender_member_profiles FOR INSERT TO authenticated
WITH CHECK (
  public.is_lender_member(auth.uid(), lender_org_id)
  AND (
    user_id = auth.uid()
    OR public.is_lender_manager(auth.uid(), lender_org_id)
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Members update their own identity"
ON public.lender_member_profiles FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_lender_manager(auth.uid(), lender_org_id)
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_lender_manager(auth.uid(), lender_org_id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE TRIGGER update_lender_member_profiles_updated_at
BEFORE UPDATE ON public.lender_member_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();