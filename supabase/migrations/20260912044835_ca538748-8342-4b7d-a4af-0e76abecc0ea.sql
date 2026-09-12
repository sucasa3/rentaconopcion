-- Unresolved Home Team evidence. A candidate is NOT a relationship: it becomes
-- one only once both sides of the edge are canonical entities.
CREATE TABLE public.home_team_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_client_id uuid NOT NULL REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.lender_orgs(id) ON DELETE SET NULL,
  role text NOT NULL,
  source text NOT NULL,
  candidate_name text NOT NULL,
  candidate_name_normalized text NOT NULL,
  confidence numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'detected',
  resolved_org_id uuid REFERENCES public.lender_orgs(id) ON DELETE SET NULL,
  resolved_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  resolved_relationship_id uuid REFERENCES public.relationships(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_team_candidates_status_chk
    CHECK (status IN ('detected','suggested','resolved','rejected','suppressed')),
  CONSTRAINT home_team_candidates_role_chk
    CHECK (role IN ('lender_organization','closing_organization','loan_officer','closing_professional'))
);

-- Different legitimate institutions for one homeowner are all allowed; the same
-- normalized name from the same source is recorded once.
CREATE UNIQUE INDEX home_team_candidates_unique_key
  ON public.home_team_candidates(portfolio_client_id, role, source, candidate_name_normalized);
CREATE INDEX home_team_candidates_client_idx ON public.home_team_candidates(portfolio_client_id);
CREATE INDEX home_team_candidates_org_idx ON public.home_team_candidates(org_id);
CREATE INDEX home_team_candidates_status_idx ON public.home_team_candidates(status);
CREATE INDEX home_team_candidates_name_idx ON public.home_team_candidates(candidate_name_normalized);

GRANT SELECT ON public.home_team_candidates TO authenticated;
GRANT ALL ON public.home_team_candidates TO service_role;
ALTER TABLE public.home_team_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home Team candidates readable by the owning organization"
  ON public.home_team_candidates FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND public.is_lender_member(auth.uid(), org_id));

CREATE POLICY "Home Team candidates readable by admins"
  ON public.home_team_candidates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_home_team_candidates_updated
  BEFORE UPDATE ON public.home_team_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Explicitly trusted alternate names for an existing canonical organization.
-- Used only for exact normalized matching; never created from provider strings.
CREATE TABLE public.organization_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalized text NOT NULL,
  trusted boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX organization_aliases_unique_key
  ON public.organization_aliases(alias_normalized, org_id);
CREATE INDEX organization_aliases_org_idx ON public.organization_aliases(org_id);

GRANT SELECT ON public.organization_aliases TO authenticated;
GRANT ALL ON public.organization_aliases TO service_role;
ALTER TABLE public.organization_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization aliases readable by their organization members"
  ON public.organization_aliases FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id));

CREATE POLICY "Organization aliases readable by admins"
  ON public.organization_aliases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_organization_aliases_updated
  BEFORE UPDATE ON public.organization_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A licence number alone is not nationally unique: only licence + jurisdiction.
CREATE UNIQUE INDEX professionals_license_state_key
  ON public.professionals(license_number, license_state)
  WHERE license_number IS NOT NULL AND license_state IS NOT NULL;
CREATE INDEX professionals_license_idx
  ON public.professionals(license_number) WHERE license_number IS NOT NULL;