UPDATE public.profiles
SET address = '1010 Arbor Creek Dr',
    city = 'Roswell',
    state = 'GA',
    updated_at = now()
WHERE id = '118c15f0-1c29-4d42-84b6-78466f07f165'
  AND address ILIKE '1010 Arbor Creek%';