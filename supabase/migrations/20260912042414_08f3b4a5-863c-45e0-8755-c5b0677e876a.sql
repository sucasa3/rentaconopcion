-- 1. Individual professionals (people only; organizations stay in lender_orgs)
CREATE TABLE public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  org_id uuid REFERENCES public.lender_orgs(id) ON DELETE SET NULL,
  /* Unresolved institution text from provider/agent input, kept until it can be
     resolved to a canonical organization. Never a substitute for org_id. */
  org_name_raw text,
  roles text[] NOT NULL DEFAULT ARRAY['loan_officer']::text[],
  full_name text NOT NULL,
  email_normalized text,
  email_verified boolean NOT NULL DEFAULT false,
  phone_normalized text,
  phone_verified boolean NOT NULL DEFAULT false,
  nmls_id text,
  license_number text,
  license_state text,
  claim_status text NOT NULL DEFAULT 'unclaimed',
  verification_status text NOT NULL DEFAULT 'unverified',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professionals_claim_status_chk CHECK (claim_status IN ('unclaimed','invited','claimed')),
  CONSTRAINT professionals_verification_status_chk CHECK (verification_status IN ('unverified','pending','verified'))
);

CREATE UNIQUE INDEX professionals_user_id_key ON public.professionals(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX professionals_nmls_key ON public.professionals(nmls_id) WHERE nmls_id IS NOT NULL;
-- Only a VERIFIED email/phone is strong enough to be globally unique.
CREATE UNIQUE INDEX professionals_verified_email_key ON public.professionals(email_normalized) WHERE email_verified;
CREATE UNIQUE INDEX professionals_verified_phone_key ON public.professionals(phone_normalized) WHERE phone_verified;
CREATE INDEX professionals_email_idx ON public.professionals(email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX professionals_phone_idx ON public.professionals(phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX professionals_org_idx ON public.professionals(org_id);
CREATE INDEX professionals_name_idx ON public.professionals(lower(full_name));

GRANT SELECT ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals readable by their own user"
  ON public.professionals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Professionals readable by their organization members"
  ON public.professionals FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND public.is_lender_member(auth.uid(), org_id));

CREATE POLICY "Professionals readable by admins"
  ON public.professionals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_professionals_updated
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Relationship + evidence graph. Describes the real world only: no
--    invitation, claim, connection, subscription, capacity or permission state.
CREATE TABLE public.relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  /* Organization in whose workspace this relationship was established. */
  org_id uuid REFERENCES public.lender_orgs(id) ON DELETE SET NULL,
  source text NOT NULL,
  source_record jsonb,
  status text NOT NULL DEFAULT 'detected',
  confidence numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* Reference only: consent_records remains the access authority. */
  consent_record_id uuid REFERENCES public.consent_records(id) ON DELETE SET NULL,
  source_relationship_id uuid REFERENCES public.relationships(id) ON DELETE SET NULL,
  asserted_by uuid,
  asserted_at timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  visibility text NOT NULL DEFAULT 'org',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT relationships_status_chk CHECK (
    status IN ('detected','suggested','asserted','confirmed','rejected','revoked')
  ),
  CONSTRAINT relationships_source_chk CHECK (
    source IN ('agent_import','agent_confirmation','homeowner_confirmation','professional_import',
               'batchdata_property','batchdata_mortgage','closing_partner_import','sucasa_admin','future_integration')
  ),
  CONSTRAINT relationships_type_chk CHECK (
    relationship_type IN ('homeowner_property','agent_homeowner','professional_homeowner_lender',
                          'agent_professional_resource','professional_professional',
                          'professional_organization','organization_homeowner')
  ),
  CONSTRAINT relationships_visibility_chk CHECK (visibility IN ('org','parties','private'))
);

CREATE UNIQUE INDEX relationships_edge_key ON public.relationships(
  relationship_type, subject_type, subject_id, object_type, object_id, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX relationships_subject_idx ON public.relationships(subject_type, subject_id);
CREATE INDEX relationships_object_idx ON public.relationships(object_type, object_id);
CREATE INDEX relationships_org_status_idx ON public.relationships(org_id, status);

GRANT SELECT ON public.relationships TO authenticated;
GRANT ALL ON public.relationships TO service_role;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Relationships readable by the owning organization"
  ON public.relationships FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND public.is_lender_member(auth.uid(), org_id));

CREATE POLICY "Relationships readable by admins"
  ON public.relationships FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_relationships_updated
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();