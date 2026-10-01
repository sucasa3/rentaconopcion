-- Combined homeowner permission "Help manage my home": systems + inspection reports contributed by that workspace.
ALTER TABLE public.home_system_access_grants DROP CONSTRAINT home_system_access_grants_scope_check;
ALTER TABLE public.home_system_access_grants ADD CONSTRAINT home_system_access_grants_scope_check
  CHECK (scope IN ('home_systems_view_edit','help_manage_home'));

CREATE OR REPLACE FUNCTION public.agent_documents_allowed(_actor uuid, _org_id uuid, _homeowner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.agent_home_system_allowed(_actor, _org_id, _homeowner)
    AND EXISTS (SELECT 1 FROM home_system_access_grants g
                WHERE g.homeowner_user_id = _homeowner AND g.org_id = _org_id
                  AND g.revoked_at IS NULL AND g.scope = 'help_manage_home')
$$;

DROP FUNCTION IF EXISTS public.list_home_system_access_options();
CREATE FUNCTION public.list_home_system_access_options()
RETURNS TABLE(org_id uuid, org_name text, member_count integer, connected boolean, enabled boolean, granted_at timestamptz, documents boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name,
    (SELECT count(*)::int FROM lender_members m WHERE m.lender_org_id = o.id),
    EXISTS (SELECT 1 FROM homeowner_lender_consents hc WHERE hc.homeowner_id = auth.uid()
            AND hc.lender_org_id = o.id AND hc.granted_at IS NOT NULL AND hc.revoked_at IS NULL),
    g.id IS NOT NULL, g.granted_at, COALESCE(g.scope = 'help_manage_home', false)
  FROM lender_orgs o
  LEFT JOIN home_system_access_grants g
    ON g.org_id = o.id AND g.homeowner_user_id = auth.uid() AND g.revoked_at IS NULL
  WHERE o.org_type = 'agent' AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM lender_portfolio_clients c JOIN lender_portfolios p ON p.id = c.portfolio_id
                WHERE p.lender_org_id = o.id AND c.homeowner_id = auth.uid() AND c.archived_at IS NULL)
  ORDER BY o.name
$$;
GRANT EXECUTE ON FUNCTION public.list_home_system_access_options() TO authenticated;

-- Enabling grants (or expands an existing systems-only grant to) the combined scope. Disabling revokes all.
CREATE OR REPLACE FUNCTION public.set_help_manage_home(p_org_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_connected boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  SELECT x.connected INTO v_connected FROM list_home_system_access_options() x WHERE x.org_id = p_org_id;
  IF v_connected IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  IF p_enabled THEN
    IF NOT v_connected THEN RETURN jsonb_build_object('ok', false, 'error', 'not_connected'); END IF;
    UPDATE home_system_access_grants SET scope = 'help_manage_home'
      WHERE homeowner_user_id = v_uid AND org_id = p_org_id AND revoked_at IS NULL;
    IF NOT FOUND THEN
      INSERT INTO home_system_access_grants (homeowner_user_id, org_id, scope)
        VALUES (v_uid, p_org_id, 'help_manage_home') ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    UPDATE home_system_access_grants SET revoked_at = now()
      WHERE homeowner_user_id = v_uid AND org_id = p_org_id AND revoked_at IS NULL;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.set_help_manage_home(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_help_manage_home(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.agent_documents_allowed(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agent_documents_allowed(uuid, uuid, uuid) TO authenticated, service_role;

-- Attribution on attached documents (single homeowner uploads keep nulls).
ALTER TABLE public.home_documents
  ADD COLUMN contributed_by_org uuid REFERENCES public.lender_orgs(id) ON DELETE SET NULL,
  ADD COLUMN contributed_by_user uuid,
  ADD COLUMN source_batch_file_id uuid,
  ADD COLUMN inspection_date date,
  ADD COLUMN proposed_findings jsonb,
  ADD COLUMN proposals_applied_at timestamptz;
CREATE UNIQUE INDEX home_documents_source_batch_file_uniq ON public.home_documents(source_batch_file_id) WHERE source_batch_file_id IS NOT NULL;

CREATE TABLE public.inspection_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.inspection_batch_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.inspection_batches(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  sha256 text,
  page_count integer,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  error text,
  extracted_address text,
  extracted_unit text,
  extracted_date date,
  address_pages integer[],
  findings jsonb,
  match_status text,
  candidate_client_ids uuid[] NOT NULL DEFAULT '{}',
  proposed_client_id uuid REFERENCES public.lender_portfolio_clients(id) ON DELETE SET NULL,
  duplicate_of uuid,
  older_than_records boolean NOT NULL DEFAULT false,
  confirmed_by uuid,
  confirmed_at timestamptz,
  attach_state text,
  document_id uuid REFERENCES public.home_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ibf_status_chk CHECK (status IN ('queued','processing','ready','unreadable','rejected','failed')),
  CONSTRAINT ibf_match_chk CHECK (match_status IS NULL OR match_status IN ('exact','ambiguous','unmatched','duplicate')),
  CONSTRAINT ibf_attach_chk CHECK (attach_state IS NULL OR attach_state IN ('attached','pending_permission','no_homeowner'))
);
CREATE INDEX ibf_batch_idx ON public.inspection_batch_files(batch_id);
CREATE INDEX ibf_org_hash_idx ON public.inspection_batch_files(org_id, sha256);

GRANT SELECT ON public.inspection_batches, public.inspection_batch_files TO authenticated;
GRANT ALL ON public.inspection_batches, public.inspection_batch_files TO service_role;
ALTER TABLE public.inspection_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_batch_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read their batches" ON public.inspection_batches
  FOR SELECT TO authenticated USING (public.is_lender_member(auth.uid(), org_id));
CREATE POLICY "Workspace members read their batch files" ON public.inspection_batch_files
  FOR SELECT TO authenticated USING (public.is_lender_member(auth.uid(), org_id));
CREATE TRIGGER trg_ibf_updated BEFORE UPDATE ON public.inspection_batch_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();