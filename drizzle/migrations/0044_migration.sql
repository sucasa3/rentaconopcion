-- Agent-designated lending contact (relationship feature; never derived from plan/payment).
CREATE TABLE public.agent_lending_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.agent_lender_connections(id) ON DELETE CASCADE,
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  lo_user_id uuid NOT NULL,
  designated_by uuid NOT NULL,
  designated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_lending_designations_one_active
  ON public.agent_lending_designations(agent_org_id) WHERE removed_at IS NULL;
GRANT SELECT ON public.agent_lending_designations TO authenticated;
GRANT ALL ON public.agent_lending_designations TO service_role;
ALTER TABLE public.agent_lending_designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent members read own designation" ON public.agent_lending_designations
  FOR SELECT TO authenticated USING (public.is_lender_member(auth.uid(), agent_org_id));

-- Homeowner-requested mortgage conversations (one record per homeowner + LO while open).
CREATE TABLE public.homeowner_lending_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid NOT NULL,
  designation_id uuid REFERENCES public.agent_lending_designations(id) ON DELETE SET NULL,
  agent_org_id uuid NOT NULL,
  lender_org_id uuid NOT NULL,
  lo_user_id uuid NOT NULL,
  lender_client_id uuid REFERENCES public.lender_portfolio_clients(id) ON DELETE SET NULL,
  opportunity_id uuid,
  consent_record_id uuid,
  contact_name text,
  contact_email text,
  contact_phone text,
  preferred_channel text NOT NULL DEFAULT 'email',
  shared_fields text[] NOT NULL DEFAULT '{name,contact,address}',
  disclosure_version text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX homeowner_lending_requests_one_open
  ON public.homeowner_lending_requests(homeowner_id, lo_user_id) WHERE status = 'open';
GRANT SELECT ON public.homeowner_lending_requests TO authenticated;
GRANT ALL ON public.homeowner_lending_requests TO service_role;
ALTER TABLE public.homeowner_lending_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homeowner reads own lending requests" ON public.homeowner_lending_requests
  FOR SELECT TO authenticated USING (auth.uid() = homeowner_id);
CREATE POLICY "assigned officer reads lending requests" ON public.homeowner_lending_requests
  FOR SELECT TO authenticated USING (auth.uid() = lo_user_id OR public.lender_is_team_manager(auth.uid(), lender_org_id));
CREATE TRIGGER trg_homeowner_lending_requests_updated BEFORE UPDATE ON public.homeowner_lending_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();