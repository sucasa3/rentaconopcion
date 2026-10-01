-- Workstream 3: homeowner-controlled agent access to home-system details,
-- versioned saves, and a change history. Writes go only through the
-- SECURITY DEFINER functions below so the save + history are atomic.

ALTER TABLE public.home_component_service_log
  ADD COLUMN IF NOT EXISTS entered_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS entered_by_role text NOT NULL DEFAULT 'homeowner',
  ADD COLUMN IF NOT EXISTS entered_by_org_id uuid,
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'added',
  ADD COLUMN IF NOT EXISTS version integer;

CREATE TABLE public.home_system_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'home_systems_view_edit' CHECK (scope = 'home_systems_view_edit'),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX home_system_access_one_active
  ON public.home_system_access_grants (homeowner_user_id, org_id) WHERE revoked_at IS NULL;
GRANT SELECT ON public.home_system_access_grants TO authenticated;
GRANT ALL ON public.home_system_access_grants TO service_role;
ALTER TABLE public.home_system_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners read their own home-system grants"
  ON public.home_system_access_grants FOR SELECT TO authenticated
  USING (auth.uid() = homeowner_user_id);

CREATE TABLE public.home_system_versions (
  homeowner_user_id uuid NOT NULL,
  component_key text NOT NULL,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (homeowner_user_id, component_key)
);
GRANT SELECT ON public.home_system_versions TO authenticated;
GRANT ALL ON public.home_system_versions TO service_role;
ALTER TABLE public.home_system_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners read their own home-system versions"
  ON public.home_system_versions FOR SELECT TO authenticated
  USING (auth.uid() = homeowner_user_id);

CREATE TABLE public.home_system_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_user_id uuid NOT NULL,
  component_key text NOT NULL,
  version integer NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('homeowner','agent')),
  org_id uuid,
  change_kind text NOT NULL CHECK (change_kind IN ('added','updated','removed')),
  old_value jsonb,
  new_value jsonb,
  log_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX home_system_changes_owner ON public.home_system_changes (homeowner_user_id, created_at DESC);
GRANT SELECT ON public.home_system_changes TO authenticated;
GRANT ALL ON public.home_system_changes TO service_role;
ALTER TABLE public.home_system_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homeowners read their own home-system history"
  ON public.home_system_changes FOR SELECT TO authenticated
  USING (auth.uid() = homeowner_user_id);

-- Homeowners keep reading their own log; writes now go through the functions.
DROP POLICY IF EXISTS "Homeowners manage their own component service log" ON public.home_component_service_log;
CREATE POLICY "Homeowners read their own component service log"
  ON public.home_component_service_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Is this agent (caller) allowed to see/edit this homeowner's systems via this workspace?
CREATE OR REPLACE FUNCTION public.agent_home_system_allowed(_actor uuid, _org_id uuid, _homeowner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM lender_members m WHERE m.user_id = _actor AND m.lender_org_id = _org_id)
    AND EXISTS (SELECT 1 FROM lender_orgs o WHERE o.id = _org_id AND o.org_type = 'agent')
    AND EXISTS (SELECT 1 FROM home_system_access_grants g
                WHERE g.homeowner_user_id = _homeowner AND g.org_id = _org_id AND g.revoked_at IS NULL)
    AND EXISTS (SELECT 1 FROM lender_portfolio_clients c JOIN lender_portfolios p ON p.id = c.portfolio_id
                WHERE p.lender_org_id = _org_id AND c.homeowner_id = _homeowner AND c.archived_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.agent_home_system_allowed(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_home_system_allowed(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.save_home_system(
  p_homeowner uuid, p_component_key text, p_org_id uuid, p_expected_version integer,
  p_action text, p_installed_year integer, p_serviced_on date, p_brand text, p_model text,
  p_warranty_years integer, p_provider text, p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_current integer;
  v_old jsonb;
  v_new jsonb;
  v_kind text;
  v_log uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF p_org_id IS NULL THEN
    IF v_uid <> p_homeowner THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
    v_role := 'homeowner';
  ELSE
    IF NOT public.agent_home_system_allowed(v_uid, p_org_id, p_homeowner) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    v_role := 'agent';
  END IF;
  IF p_action NOT IN ('replaced','serviced') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  INSERT INTO home_system_versions (homeowner_user_id, component_key, version)
    VALUES (p_homeowner, p_component_key, 0) ON CONFLICT DO NOTHING;
  SELECT version INTO v_current FROM home_system_versions
    WHERE homeowner_user_id = p_homeowner AND component_key = p_component_key FOR UPDATE;

  IF p_expected_version IS DISTINCT FROM v_current AND p_component_key NOT LIKE 'seasonal:%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'version', v_current);
  END IF;

  SELECT to_jsonb(l) - 'user_id' - 'updated_at' INTO v_old FROM home_component_service_log l
    WHERE l.user_id = p_homeowner AND l.component_key = p_component_key
    ORDER BY l.created_at DESC LIMIT 1;
  v_kind := CASE WHEN v_old IS NULL THEN 'added' ELSE 'updated' END;

  INSERT INTO home_component_service_log (user_id, component_key, action, installed_year, serviced_on,
    brand, model, warranty_years, provider, notes, entered_by_user_id, entered_by_role, entered_by_org_id,
    entry_kind, version)
  VALUES (p_homeowner, p_component_key, p_action, p_installed_year, p_serviced_on, p_brand, p_model,
    p_warranty_years, p_provider, p_notes, v_uid, v_role, p_org_id, v_kind, v_current + 1)
  RETURNING id INTO v_log;

  SELECT to_jsonb(l) - 'user_id' - 'updated_at' INTO v_new FROM home_component_service_log l WHERE l.id = v_log;

  UPDATE home_system_versions SET version = v_current + 1, updated_at = now()
    WHERE homeowner_user_id = p_homeowner AND component_key = p_component_key;

  INSERT INTO home_system_changes (homeowner_user_id, component_key, version, actor_user_id, actor_role,
    org_id, change_kind, old_value, new_value, log_id)
  VALUES (p_homeowner, p_component_key, v_current + 1, v_uid, v_role, p_org_id, v_kind, v_old, v_new, v_log);

  RETURN jsonb_build_object('ok', true, 'version', v_current + 1, 'kind', v_kind);
END $$;
REVOKE ALL ON FUNCTION public.save_home_system(uuid, text, uuid, integer, text, integer, date, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_home_system(uuid, text, uuid, integer, text, integer, date, text, text, integer, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_home_system_entry(p_log_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row home_component_service_log; v_current integer;
BEGIN
  SELECT * INTO v_row FROM home_component_service_log WHERE id = p_log_id;
  IF v_row.id IS NULL OR v_uid IS NULL OR v_row.user_id <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  INSERT INTO home_system_versions (homeowner_user_id, component_key, version)
    VALUES (v_uid, v_row.component_key, 0) ON CONFLICT DO NOTHING;
  SELECT version INTO v_current FROM home_system_versions
    WHERE homeowner_user_id = v_uid AND component_key = v_row.component_key FOR UPDATE;
  DELETE FROM home_component_service_log WHERE id = p_log_id;
  UPDATE home_system_versions SET version = v_current + 1, updated_at = now()
    WHERE homeowner_user_id = v_uid AND component_key = v_row.component_key;
  INSERT INTO home_system_changes (homeowner_user_id, component_key, version, actor_user_id, actor_role,
    change_kind, old_value, log_id)
  VALUES (v_uid, v_row.component_key, v_current + 1, v_uid, 'homeowner', 'removed',
    to_jsonb(v_row) - 'user_id' - 'updated_at', p_log_id);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.delete_home_system_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_home_system_entry(uuid) TO authenticated, service_role;

-- Homeowner: which agent workspaces could they grant access to, and current state.
CREATE OR REPLACE FUNCTION public.list_home_system_access_options()
RETURNS TABLE(org_id uuid, org_name text, member_count integer, enabled boolean, granted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name,
    (SELECT count(*)::int FROM lender_members m WHERE m.lender_org_id = o.id),
    g.id IS NOT NULL, g.granted_at
  FROM lender_orgs o
  LEFT JOIN home_system_access_grants g
    ON g.org_id = o.id AND g.homeowner_user_id = auth.uid() AND g.revoked_at IS NULL
  WHERE o.org_type = 'agent' AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM lender_portfolio_clients c JOIN lender_portfolios p ON p.id = c.portfolio_id
                WHERE p.lender_org_id = o.id AND c.homeowner_id = auth.uid() AND c.archived_at IS NULL)
  ORDER BY o.name
$$;
REVOKE ALL ON FUNCTION public.list_home_system_access_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_home_system_access_options() TO authenticated, service_role;

-- Only the homeowner (auth.uid()) can grant or revoke, for a workspace they are linked to.
CREATE OR REPLACE FUNCTION public.set_home_system_access(p_org_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  IF NOT EXISTS (SELECT 1 FROM list_home_system_access_options() x WHERE x.org_id = p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_enabled THEN
    INSERT INTO home_system_access_grants (homeowner_user_id, org_id)
      VALUES (v_uid, p_org_id) ON CONFLICT DO NOTHING;
  ELSE
    UPDATE home_system_access_grants SET revoked_at = now()
      WHERE homeowner_user_id = v_uid AND org_id = p_org_id AND revoked_at IS NULL;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.set_home_system_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_home_system_access(uuid, boolean) TO authenticated, service_role;

-- Agent read: nothing is returned unless access is currently allowed.
CREATE OR REPLACE FUNCTION public.get_home_systems_for_agent(p_org_id uuid, p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_home uuid;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM lender_members m WHERE m.user_id = v_uid AND m.lender_org_id = p_org_id) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_member');
  END IF;
  SELECT c.homeowner_id INTO v_home FROM lender_portfolio_clients c JOIN lender_portfolios p ON p.id = c.portfolio_id
    WHERE c.id = p_client_id AND p.lender_org_id = p_org_id AND c.archived_at IS NULL;
  IF v_home IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'no_account'); END IF;
  IF NOT public.agent_home_system_allowed(v_uid, p_org_id, v_home) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_permission');
  END IF;
  RETURN jsonb_build_object(
    'allowed', true,
    'homeowner', v_home,
    'entries', COALESCE((SELECT jsonb_agg(to_jsonb(l) - 'user_id' ORDER BY l.created_at DESC)
                FROM home_component_service_log l WHERE l.user_id = v_home AND l.component_key NOT LIKE 'seasonal:%'), '[]'::jsonb),
    'versions', COALESCE((SELECT jsonb_object_agg(v.component_key, v.version)
                FROM home_system_versions v WHERE v.homeowner_user_id = v_home), '{}'::jsonb),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object('component_key', h.component_key, 'version', h.version,
                  'actor_role', h.actor_role, 'change_kind', h.change_kind, 'old_value', h.old_value,
                  'new_value', h.new_value, 'created_at', h.created_at, 'by_this_workspace', h.org_id = p_org_id)
                  ORDER BY h.created_at DESC)
                FROM (SELECT * FROM home_system_changes WHERE homeowner_user_id = v_home AND component_key NOT LIKE 'seasonal:%'
                      ORDER BY created_at DESC LIMIT 50) h), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_home_systems_for_agent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_home_systems_for_agent(uuid, uuid) TO authenticated, service_role;