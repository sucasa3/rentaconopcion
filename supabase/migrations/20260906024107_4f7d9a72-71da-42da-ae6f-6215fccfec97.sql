-- 1. Plan catalogue -------------------------------------------------------
UPDATE public.plan_tiers SET active = false WHERE key IN ('mlo_essentials','mlo_growth','branch_growth','branch_pro','agent_core','agent_plus','agent_pro','enterprise');

INSERT INTO public.plan_tiers (key, name, audience, price_cents, profile_allowance, sponsored_seats, sponsored_allocation, seat_limit, positioning, sort_order, active)
VALUES
  ('mlo',          'MLO',          'lender',   7900,   250,   3,   3,  1, 'For a single loan officer getting started.', 10, true),
  ('mlo_growth_v2','MLO Growth',   'lender',  14900,  1000,  10,  10,  1, 'For a growing book and a small agent network.', 20, true),
  ('branch',       'Branch',       'lender',  49900,  5000,  25,  25,  5, 'For a branch team with an active referral network.', 30, true),
  ('branch_pro_v2','Branch Pro',   'lender',  79900, 10000,  50,  50, 15, 'For a large branch running outreach at scale.', 40, true),
  ('network',      'Network',      'lender', 149900, 25000, 100, 100, 30, 'For multi-branch and enterprise lending networks.', 50, true),
  ('agent',        'Agent',        'agent',    4900,   250,   0,   0,  1, 'Keep your Home Profiles running independently.', 60, true),
  ('agent_growth', 'Agent Growth', 'agent',    9900,  1000,   0,   0,  1, 'For agents with a large past-client database.', 70, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, audience = EXCLUDED.audience, price_cents = EXCLUDED.price_cents,
  profile_allowance = EXCLUDED.profile_allowance, sponsored_seats = EXCLUDED.sponsored_seats,
  sponsored_allocation = EXCLUDED.sponsored_allocation, seat_limit = EXCLUDED.seat_limit,
  positioning = EXCLUDED.positioning, sort_order = EXCLUDED.sort_order, active = true;

-- 2. Add-on catalogue and purchases ---------------------------------------
CREATE TABLE IF NOT EXISTS public.addon_products (
  key text PRIMARY KEY,
  name text NOT NULL,
  audience text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('profiles','agent_seats')),
  unit_quantity integer NOT NULL,
  price_cents integer NOT NULL,
  stripe_price_id text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.addon_products TO authenticated;
GRANT ALL ON public.addon_products TO service_role;
ALTER TABLE public.addon_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addon_products_read" ON public.addon_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "addon_products_admin_manage" ON public.addon_products TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_addon_products_updated BEFORE UPDATE ON public.addon_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.addon_products (key, name, audience, kind, unit_quantity, price_cents, sort_order, active)
VALUES
  ('profiles_500','+500 Home Profiles','any','profiles',500,4900,10,true),
  ('agent_seats_5','+5 Sponsored Agents','lender','agent_seats',5,2900,20,true)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, unit_quantity = EXCLUDED.unit_quantity,
  price_cents = EXCLUDED.price_cents, active = true;

CREATE TABLE IF NOT EXISTS public.org_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  addon_key text NOT NULL REFERENCES public.addon_products(key),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  stripe_subscription_item_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_addons_org_idx ON public.org_addons (org_id, status);
GRANT SELECT ON public.org_addons TO authenticated;
GRANT ALL ON public.org_addons TO service_role;
ALTER TABLE public.org_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_addons_member_read" ON public.org_addons FOR SELECT TO authenticated
  USING (public.is_lender_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "org_addons_admin_manage" ON public.org_addons TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_org_addons_updated BEFORE UPDATE ON public.org_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Archiving -------------------------------------------------------------
ALTER TABLE public.lender_portfolio_clients
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text;
CREATE INDEX IF NOT EXISTS portfolio_clients_active_idx
  ON public.lender_portfolio_clients (portfolio_id) WHERE archived_at IS NULL;

-- 4. Organization capacity and plan-change fields --------------------------
ALTER TABLE public.lender_orgs
  ADD COLUMN IF NOT EXISTS reserved_profiles integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commitment_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_plan_key text REFERENCES public.plan_tiers(key),
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamptz;

-- 5. Sponsorship grace period ---------------------------------------------
ALTER TABLE public.sponsored_agent_seats
  ADD COLUMN IF NOT EXISTS grace_until timestamptz;

-- 6. Pool-aware sponsorship guard -----------------------------------------
CREATE OR REPLACE FUNCTION public.org_active_profile_count(_org_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int
    FROM public.lender_portfolio_clients c
    JOIN public.lender_portfolios p ON p.id = c.portfolio_id
   WHERE p.lender_org_id = _org_id AND c.archived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.org_profile_capacity(_org_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(o.profile_allowance, 0)
       + COALESCE((
           SELECT sum(a.quantity * p.unit_quantity)::int
             FROM public.org_addons a
             JOIN public.addon_products p ON p.key = a.addon_key
            WHERE a.org_id = _org_id AND a.status = 'active' AND p.kind = 'profiles'
         ), 0)
    FROM public.lender_orgs o WHERE o.id = _org_id;
$$;

CREATE OR REPLACE FUNCTION public.tg_enforce_sponsor_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seat_cap integer;
  v_seats_used integer;
  v_capacity integer;
  v_lender_used integer;
  v_allocated integer;
BEGIN
  SELECT COALESCE(o.sponsored_allocation, t.sponsored_seats, 0)
       + COALESCE((
           SELECT sum(a.quantity * p.unit_quantity)::int
             FROM public.org_addons a
             JOIN public.addon_products p ON p.key = a.addon_key
            WHERE a.org_id = NEW.sponsor_org_id AND a.status = 'active' AND p.kind = 'agent_seats'
         ), 0)
    INTO v_seat_cap
    FROM public.lender_orgs o
    LEFT JOIN public.plan_tiers t ON t.key = o.plan_key
   WHERE o.id = NEW.sponsor_org_id;

  SELECT count(*) INTO v_seats_used
    FROM public.sponsored_profiles
   WHERE sponsor_org_id = NEW.sponsor_org_id AND status <> 'ended';

  IF v_seats_used >= COALESCE(v_seat_cap, 0) THEN
    RAISE EXCEPTION 'Sponsored capacity exhausted (% of % in use)', v_seats_used, COALESCE(v_seat_cap, 0);
  END IF;

  v_capacity := public.org_profile_capacity(NEW.sponsor_org_id);
  v_lender_used := public.org_active_profile_count(NEW.sponsor_org_id);
  SELECT COALESCE(sum(credits_granted), 0) INTO v_allocated
    FROM public.sponsored_agent_seats
   WHERE sponsor_org_id = NEW.sponsor_org_id AND status = 'active';

  IF v_lender_used + v_allocated > v_capacity THEN
    RAISE EXCEPTION 'Home Profile pool exhausted (% used or allocated of %)', v_lender_used + v_allocated, v_capacity;
  END IF;

  RETURN NEW;
END; $$;