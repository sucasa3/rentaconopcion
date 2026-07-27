
-- === HOME DOCUMENTS ===
CREATE TABLE public.home_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  storage_path text not null,
  original_filename text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_documents TO authenticated;
GRANT ALL ON public.home_documents TO service_role;
ALTER TABLE public.home_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_documents_owner_all ON public.home_documents
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY home_documents_admin_read ON public.home_documents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_home_documents_updated BEFORE UPDATE ON public.home_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === LENDER ROLE ===
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'lender';

-- === LENDER ORGS ===
CREATE TABLE public.lender_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  license_number text,
  primary_contact_email text,
  plan text not null default 'msa_997',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_orgs TO authenticated;
GRANT ALL ON public.lender_orgs TO service_role;
ALTER TABLE public.lender_orgs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lender_members (
  id uuid primary key default gen_random_uuid(),
  lender_org_id uuid not null references public.lender_orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (lender_org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_members TO authenticated;
GRANT ALL ON public.lender_members TO service_role;
ALTER TABLE public.lender_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_lender_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.lender_members WHERE user_id = _user_id AND lender_org_id = _org_id)
$$;

CREATE POLICY lender_orgs_member_read ON public.lender_orgs
  FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY lender_orgs_admin_write ON public.lender_orgs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY lender_members_self_read ON public.lender_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY lender_members_admin_write ON public.lender_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === PORTFOLIOS ===
CREATE TABLE public.lender_portfolios (
  id uuid primary key default gen_random_uuid(),
  lender_org_id uuid not null references public.lender_orgs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_portfolios TO authenticated;
GRANT ALL ON public.lender_portfolios TO service_role;
ALTER TABLE public.lender_portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY lender_portfolios_member_all ON public.lender_portfolios
  FOR ALL TO authenticated
  USING (public.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.lender_portfolio_clients (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.lender_portfolios(id) on delete cascade,
  homeowner_id uuid references auth.users(id) on delete set null,
  client_name text,
  client_email text,
  client_phone text,
  address_line1 text not null,
  city text,
  state text,
  zip text,
  close_date date,
  loan_amount_at_close_cents bigint,
  rate_at_close numeric(6,4),
  term_months integer,
  notes text,
  last_intel_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_portfolio_clients TO authenticated;
GRANT ALL ON public.lender_portfolio_clients TO service_role;
ALTER TABLE public.lender_portfolio_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY lender_portfolio_clients_member_all ON public.lender_portfolio_clients
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lender_portfolios p WHERE p.id = portfolio_id
    AND (public.is_lender_member(auth.uid(), p.lender_org_id) OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lender_portfolios p WHERE p.id = portfolio_id
    AND (public.is_lender_member(auth.uid(), p.lender_org_id) OR public.has_role(auth.uid(), 'admin'))));

-- === CONSENTS ===
CREATE TABLE public.homeowner_lender_consents (
  id uuid primary key default gen_random_uuid(),
  homeowner_id uuid not null references auth.users(id) on delete cascade,
  lender_org_id uuid not null references public.lender_orgs(id) on delete cascade,
  scope text not null default 'portfolio_view',
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (homeowner_id, lender_org_id, scope)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homeowner_lender_consents TO authenticated;
GRANT ALL ON public.homeowner_lender_consents TO service_role;
ALTER TABLE public.homeowner_lender_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY consents_homeowner_all ON public.homeowner_lender_consents
  FOR ALL TO authenticated USING (homeowner_id = auth.uid()) WITH CHECK (homeowner_id = auth.uid());
CREATE POLICY consents_lender_read ON public.homeowner_lender_consents
  FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_lender_access(_org_id uuid, _homeowner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.homeowner_lender_consents
    WHERE lender_org_id = _org_id AND homeowner_id = _homeowner_id
      AND revoked_at IS NULL AND granted_at IS NOT NULL
  )
$$;

-- === LENDER ACTIVITY ===
CREATE TABLE public.lender_activity (
  id uuid primary key default gen_random_uuid(),
  lender_org_id uuid not null references public.lender_orgs(id) on delete cascade,
  portfolio_client_id uuid not null references public.lender_portfolio_clients(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_activity TO authenticated;
GRANT ALL ON public.lender_activity TO service_role;
ALTER TABLE public.lender_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY lender_activity_member_all ON public.lender_activity
  FOR ALL TO authenticated
  USING (public.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_lender_member(auth.uid(), lender_org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_lender_orgs_updated BEFORE UPDATE ON public.lender_orgs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lender_portfolios_updated BEFORE UPDATE ON public.lender_portfolios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lender_portfolio_clients_updated BEFORE UPDATE ON public.lender_portfolio_clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_consents_updated BEFORE UPDATE ON public.homeowner_lender_consents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_lender_members_user ON public.lender_members(user_id);
CREATE INDEX idx_portfolio_clients_portfolio ON public.lender_portfolio_clients(portfolio_id);
CREATE INDEX idx_consents_homeowner ON public.homeowner_lender_consents(homeowner_id);
