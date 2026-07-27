
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'neilterc@hotmail.com';
  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid,
      'authenticated', 'authenticated',
      'neilterc@hotmail.com',
      crypt('SuCasaTest2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Neil Terc"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at
    ) VALUES (
      gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'neilterc@hotmail.com', 'email_verified', true),
      'email', v_uid::text, now(), now(), now()
    );
  END IF;

  -- Ensure profile with full details (handle_new_user trigger created a stub)
  INSERT INTO public.profiles (id, full_name, email, phone, address, city, state, zip)
  VALUES (v_uid, 'Neil Terc', 'neilterc@hotmail.com', '678-485-3054',
          '2138 Gunstock Dr', 'Stone Mountain', 'GA', '30087')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone     = EXCLUDED.phone,
    address   = EXCLUDED.address,
    city      = EXCLUDED.city,
    state     = EXCLUDED.state,
    zip       = EXCLUDED.zip,
    email     = EXCLUDED.email;

  -- Grant all three test roles (homeowner may already exist from trigger)
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_uid, 'homeowner'), (v_uid, 'pro'), (v_uid, 'lender')
  ON CONFLICT DO NOTHING;

  -- Pro record owned by Neil
  IF NOT EXISTS (SELECT 1 FROM public.pros WHERE user_id = v_uid) THEN
    INSERT INTO public.pros (
      user_id, business_name, category, service_area, plan,
      is_founding_partner, monthly_price_cents, accepting_leads, active,
      phone, email
    ) VALUES (
      v_uid, 'Neil Terc — Test Pro', 'general', 'Atlanta Metro', 'founding',
      true, 29700, true, true, '678-485-3054', 'neilterc@hotmail.com'
    );
  END IF;

  -- Coverage so the pro inbox has zips to match
  INSERT INTO public.pro_coverage (pro_id, category, zip, metro)
  SELECT id, 'general', z, 'Atlanta'
  FROM public.pros p, unnest(ARRAY['30087','30060','30303','30004','30030']) z
  WHERE p.user_id = v_uid
  ON CONFLICT DO NOTHING;

  -- Lender org + membership
  INSERT INTO public.lender_orgs (id, name, primary_contact_email, plan, active)
  VALUES ('11111111-1111-1111-1111-111111111111'::uuid,
          'SuCasa Demo Lender', 'neilterc@hotmail.com', 'demo', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.lender_members (lender_org_id, user_id, role)
  VALUES ('11111111-1111-1111-1111-111111111111'::uuid, v_uid, 'owner')
  ON CONFLICT DO NOTHING;
END $$;
