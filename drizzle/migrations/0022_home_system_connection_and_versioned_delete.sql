-- Home-system access requires an accepted, active general agent connection.
CREATE OR REPLACE FUNCTION public.agent_home_system_allowed(_actor uuid, _org_id uuid, _homeowner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM lender_members m WHERE m.user_id = _actor AND m.lender_org_id = _org_id)
    AND EXISTS (SELECT 1 FROM lender_orgs o WHERE o.id = _org_id AND o.org_type = 'agent')
    AND EXISTS (SELECT 1 FROM home_system_access_grants g
                WHERE g.homeowner_user_id = _homeowner AND g.org_id = _org_id AND g.revoked_at IS NULL)
    AND EXISTS (SELECT 1 FROM homeowner_lender_consents c
                WHERE c.homeowner_id = _homeowner AND c.lender_org_id = _org_id
                  AND c.granted_at IS NOT NULL AND c.revoked_at IS NULL)
    AND EXISTS (SELECT 1 FROM lender_portfolio_clients c JOIN lender_portfolios p ON p.id = c.portfolio_id
                WHERE p.lender_org_id = _org_id AND c.homeowner_id = _homeowner AND c.archived_at IS NULL)
$$;

DROP FUNCTION IF EXISTS public.set_home_system_access(uuid, boolean);
DROP FUNCTION IF EXISTS public.list_home_system_access_options();

CREATE FUNCTION public.list_home_system_access_options()
RETURNS TABLE(org_id uuid, org_name text, member_count integer, connected boolean, enabled boolean, granted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name,
    (SELECT count(*)::int FROM lender_members m WHERE m.lender_org_id = o.id),
    EXISTS (SELECT 1 FROM homeowner_lender_consents hc WHERE hc.homeowner_id = auth.uid()
            AND hc.lender_org_id = o.id AND hc.granted_at IS NOT NULL AND hc.revoked_at IS NULL),
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

CREATE FUNCTION public.set_home_system_access(p_org_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_connected boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;
  SELECT x.connected INTO v_connected FROM list_home_system_access_options() x WHERE x.org_id = p_org_id;
  IF v_connected IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  IF p_enabled THEN
    IF NOT v_connected THEN RETURN jsonb_build_object('ok', false, 'error', 'not_connected'); END IF;
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

-- Versioned delete: homeowner only, refuses stale versions, history recorded atomically.
CREATE OR REPLACE FUNCTION public.delete_home_system_entry(p_log_id uuid, p_expected_version integer)
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
  IF p_expected_version IS DISTINCT FROM v_current THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'version', v_current);
  END IF;
  DELETE FROM home_component_service_log WHERE id = p_log_id;
  UPDATE home_system_versions SET version = v_current + 1, updated_at = now()
    WHERE homeowner_user_id = v_uid AND component_key = v_row.component_key;
  INSERT INTO home_system_changes (homeowner_user_id, component_key, version, actor_user_id, actor_role,
    change_kind, old_value, log_id)
  VALUES (v_uid, v_row.component_key, v_current + 1, v_uid, 'homeowner', 'removed',
    to_jsonb(v_row) - 'user_id' - 'updated_at', p_log_id);
  RETURN jsonb_build_object('ok', true, 'version', v_current + 1);
END $$;
REVOKE ALL ON FUNCTION public.delete_home_system_entry(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_home_system_entry(uuid, integer) TO authenticated, service_role;

-- Retire the unversioned delete.
DROP FUNCTION IF EXISTS public.delete_home_system_entry(uuid);

-- CRM sync: flagged test homeowners can never be dispatched, including pending/retry rows.
CREATE OR REPLACE FUNCTION public.tg_block_test_ghl_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.processed_at IS NULL AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.is_test_account
      AND (p.id = NEW.entity_id OR p.user_id = NEW.entity_id)) THEN
    NEW.processed_at := now();
    NEW.last_error := 'skipped: test account';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS block_test_ghl_sync ON public.ghl_sync_queue;
CREATE TRIGGER block_test_ghl_sync BEFORE INSERT OR UPDATE ON public.ghl_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_test_ghl_sync();