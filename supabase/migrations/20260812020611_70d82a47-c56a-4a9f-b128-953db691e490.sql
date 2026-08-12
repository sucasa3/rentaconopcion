UPDATE public.profiles p
SET zip = '30076', city = COALESCE(NULLIF(p.city, ''), 'Roswell'), state = COALESCE(NULLIF(p.state, ''), 'GA'), updated_at = now()
FROM auth.users u
WHERE u.id = p.id
  AND u.email = 'agent.officer@sucasatest.com'
  AND (p.zip IS NULL OR p.zip = '');