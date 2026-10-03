CREATE OR REPLACE FUNCTION public.qa_lender_team_checks()
RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _b uuid := '5ea70000-0000-4000-8000-000000000001';
  _m uuid := '44796710-46eb-4810-b1ee-f83b592b16aa';
  _o uuid := 'a804c462-9bc7-4f6e-ad04-ecb053d4b515';
  _keep uuid;
  _c uuid := '5ea7c000-0000-4000-8000-000000000001';
  _n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lender_orgs WHERE id = _b AND is_test_account AND name LIKE 'TEST-SYNTHETIC%') THEN
    RETURN NEXT 'fixture missing'; RETURN;
  END IF;
  SELECT user_id INTO _keep FROM lender_members WHERE lender_org_id = _b AND user_id NOT IN (_m, _o) ORDER BY created_at DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _o)::text, true);
  BEGIN UPDATE agent_lender_connections SET message = 'x' WHERE id = _c; RETURN NEXT 'officer edits manager collab: ALLOWED (bad)';
  EXCEPTION WHEN others THEN RETURN NEXT 'officer edits manager collab: ' || SQLERRM; END;
  BEGIN UPDATE agent_lender_connections SET owner_user_id = _o WHERE id = _c; RETURN NEXT 'officer self-reassign: ALLOWED (bad)';
  EXCEPTION WHEN others THEN RETURN NEXT 'officer self-reassign: ' || SQLERRM; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _m)::text, true);
  UPDATE agent_lender_connections SET owner_user_id = _o WHERE id = _c;
  RETURN NEXT 'manager reassigns to officer: owner=' || (SELECT CASE WHEN owner_user_id = _o THEN 'officer' ELSE owner_user_id::text END FROM agent_lender_connections WHERE id = _c);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _o)::text, true);
  BEGIN UPDATE agent_lender_connections SET message = 'ok' WHERE id = _c; RETURN NEXT 'officer edits own collab: ok';
  EXCEPTION WHEN others THEN RETURN NEXT 'officer edits own collab: ' || SQLERRM; END;
  INSERT INTO agent_lender_connections (lender_org_id, invited_email, status, invited_by, owner_user_id)
  VALUES (_b, 'agent-synth2@example.com', 'invited', _o, _m);
  RETURN NEXT 'officer invites agent claiming manager as owner -> owner=' ||
    (SELECT CASE WHEN owner_user_id = _o THEN 'officer (forced)' ELSE owner_user_id::text END
       FROM agent_lender_connections WHERE invited_email = 'agent-synth2@example.com' AND lender_org_id = _b);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _m)::text, true);
  PERFORM set_lender_retained_members(_b, ARRAY[_keep]);
  UPDATE lender_orgs SET seat_limit = 2 WHERE id = _b;
  _n := apply_lender_seat_allowance(_b);
  RETURN NEXT 'downgrade to 2: suspended=' || _n || ' kept=' ||
    (SELECT string_agg(CASE user_id WHEN _m THEN 'owner' WHEN _keep THEN 'selected' ELSE user_id::text END, ',' ORDER BY role) FROM lender_members WHERE lender_org_id = _b);
  RETURN NEXT 'books preserved: ' || (SELECT count(*) FROM lender_portfolios WHERE lender_org_id = _b) ||
    ', officer book still assigned to officer: ' || (SELECT (assigned_user_id = _o)::text FROM lender_portfolios WHERE id = '5ea7b000-0000-4000-8000-00000000000b');
  RETURN NEXT 'suspended officer can see own book: ' || lender_book_visible(_o, _b, _o)::text;

  UPDATE lender_orgs SET seat_limit = 5 WHERE id = _b;
  RETURN NEXT 'after upgrade active members=' || (SELECT count(*) FROM lender_members WHERE lender_org_id = _b);
  PERFORM reactivate_lender_member(_b, _o);
  RETURN NEXT 'manager reactivates officer: active=' || (SELECT count(*) FROM lender_members WHERE lender_org_id = _b)
     || ', book assignment intact=' || (SELECT (assigned_user_id = _o)::text FROM lender_portfolios WHERE id = '5ea7b000-0000-4000-8000-00000000000b');

  UPDATE lender_orgs SET retained_member_ids = NULL, seat_limit = 1 WHERE id = _b;
  _n := apply_lender_seat_allowance(_b);
  RETURN NEXT 'downgrade to 1 without selection: remaining=' ||
    (SELECT string_agg(role, ',') FROM lender_members WHERE lender_org_id = _b);
  BEGIN PERFORM reactivate_lender_member(_b, _o); RETURN NEXT 'reactivate over capacity: ALLOWED (bad)';
  EXCEPTION WHEN others THEN RETURN NEXT 'reactivate over capacity: ' || SQLERRM; END;
END $$;