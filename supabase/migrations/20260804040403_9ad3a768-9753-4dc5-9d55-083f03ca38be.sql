-- 1. Partner org type
ALTER TABLE public.lender_orgs
  ADD COLUMN IF NOT EXISTS org_type text NOT NULL DEFAULT 'lender';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS campaign_opt_out boolean NOT NULL DEFAULT false;

-- 2. Campaign catalog
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  channel text NOT NULL DEFAULT 'email',
  cadence text NOT NULL DEFAULT 'monthly',
  trigger_month integer,
  min_days_between integer NOT NULL DEFAULT 25,
  ghl_tag text NOT NULL,
  prompt_template text NOT NULL,
  data_fields text[] NOT NULL DEFAULT '{}',
  cta_label text,
  cta_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_read ON public.campaigns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY campaigns_admin_write ON public.campaigns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_campaigns_updated
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Activations
CREATE TABLE public.campaign_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_org_id uuid NOT NULL REFERENCES public.lender_orgs(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES public.lender_portfolios(id) ON DELETE CASCADE,
  portfolio_client_id uuid REFERENCES public.lender_portfolio_clients(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX campaign_activations_org_scope_uniq
  ON public.campaign_activations (lender_org_id, campaign_id, COALESCE(portfolio_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(portfolio_client_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_activations TO authenticated;
GRANT ALL ON public.campaign_activations TO service_role;
ALTER TABLE public.campaign_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_activations_member_all ON public.campaign_activations
  FOR ALL TO authenticated
  USING (private.is_lender_member(auth.uid(), lender_org_id) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.is_lender_member(auth.uid(), lender_org_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_campaign_activations_updated
  BEFORE UPDATE ON public.campaign_activations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Sends
CREATE TABLE public.campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lender_org_id uuid REFERENCES public.lender_orgs(id) ON DELETE SET NULL,
  portfolio_client_id uuid REFERENCES public.lender_portfolio_clients(id) ON DELETE SET NULL,
  homeowner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text,
  recipient_name text,
  subject text,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  ghl_contact_id text,
  error_message text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaign_sends_campaign_client_idx
  ON public.campaign_sends (campaign_id, portfolio_client_id, created_at DESC);
CREATE INDEX campaign_sends_homeowner_idx
  ON public.campaign_sends (homeowner_id, created_at DESC);
CREATE INDEX campaign_sends_status_idx ON public.campaign_sends (status);

GRANT SELECT ON public.campaign_sends TO authenticated;
GRANT ALL ON public.campaign_sends TO service_role;
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_sends_org_read ON public.campaign_sends
  FOR SELECT TO authenticated
  USING (
    (lender_org_id IS NOT NULL AND private.is_lender_member(auth.uid(), lender_org_id))
    OR homeowner_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER trg_campaign_sends_updated
  BEFORE UPDATE ON public.campaign_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Seed the 12-campaign catalog
INSERT INTO public.campaigns (key, name, description, cadence, trigger_month, min_days_between, ghl_tag, cta_label, data_fields, sort_order, prompt_template) VALUES
('monthly_value_update','Monthly home value update','A short monthly note with the current estimated value and how it moved.','monthly',NULL,25,'sucasa_monthly_value_update','See your home report',ARRAY['value','value_change','equity'],10,'Write a warm, factual 2-sentence update about the homeowner''s estimated home value and how it changed this month. No hype, no invented numbers.'),
('equity_checkup','Equity checkup','Highlights usable equity and PMI removal opportunities.','quarterly',NULL,80,'sucasa_equity_checkup','Review my equity',ARRAY['value','equity','equity_pct','loan_balance'],20,'Write a 2-3 sentence equity checkup. Mention usable equity and, if loan-to-value is under 80%, that PMI may be removable. Factual, no pressure.'),
('home_anniversary','Home anniversary','Celebrates the purchase anniversary with equity built since close.','event',NULL,300,'sucasa_home_anniversary','See my equity',ARRAY['close_date','years_owned','equity_gain'],30,'Write a short, friendly home-anniversary note congratulating the homeowner and stating the equity built since they purchased.'),
('neighborhood_activity','Neighborhood activity','Recent nearby sales and local market movement.','monthly',NULL,25,'sucasa_neighborhood_activity','See nearby sales',ARRAY['recent_sales','median_price','city'],40,'Write 2 sentences summarizing recent nearby home sales and what they suggest about the local market. Only use provided figures.'),
('maintenance_spring_hvac','Spring HVAC service reminder','Seasonal reminder to service the cooling system before summer.','seasonal',4,300,'sucasa_maintenance_spring_hvac','Book a pro',ARRAY['hvac_age','city'],50,'Write a brief spring reminder to service the HVAC system before summer, referencing the system''s age if known.'),
('maintenance_fall_gutters','Fall gutter cleaning reminder','Seasonal reminder to clear gutters before winter.','seasonal',10,300,'sucasa_maintenance_fall_gutters','Book a pro',ARRAY['city'],60,'Write a brief fall reminder to clean gutters and downspouts before heavy rain and freezing weather.'),
('maintenance_smoke_detectors','Smoke detector check','Twice-yearly safety check reminder.','seasonal',3,150,'sucasa_maintenance_smoke_detectors','Home safety tips',ARRAY[]::text[],70,'Write a two-sentence safety reminder to test smoke and carbon monoxide detectors and replace batteries.'),
('maintenance_winterization','Winterization checklist','Prepare the home for cold weather.','seasonal',11,300,'sucasa_maintenance_winterization','Book a pro',ARRAY['city','home_age'],80,'Write a short winterization reminder tailored to the home''s location and age.'),
('seasonal_storm_prep','Storm and hurricane prep','Pre-season preparation for storm-exposed homes.','seasonal',5,300,'sucasa_seasonal_storm_prep','Prep checklist',ARRAY['city','state','risk'],90,'Write a short storm-preparation reminder relevant to the home''s location.'),
('tax_homestead_reminder','Property tax and homestead reminder','Assessment appeal window and homestead exemption deadlines.','seasonal',1,300,'sucasa_tax_homestead_reminder','Review my assessment',ARRAY['assessed_value','tax_amount','state'],100,'Write a short factual reminder about the property tax assessment and the homestead exemption filing window in the homeowner''s state.'),
('vendor_recommendation','Vendor recommendation','Recommends a trusted SuCasa pro when maintenance is due.','event',NULL,45,'sucasa_vendor_recommendation','See recommended pros',ARRAY['due_systems','category','city'],110,'Write a 2-sentence note recommending service for the home system that is due, and that SuCasa can match a vetted local pro.'),
('refi_opportunity','Refi opportunity','Triggered when equity and rate suggest meaningful savings.','event',NULL,90,'sucasa_refi_opportunity','See my options',ARRAY['rate','equity','estimated_savings'],120,'Write a 2-3 sentence note about a potential refinance opportunity using only the provided rate, equity and estimated monthly savings. No guarantees or promises.');