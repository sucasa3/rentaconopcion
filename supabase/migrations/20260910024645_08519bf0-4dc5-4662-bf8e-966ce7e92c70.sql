CREATE TABLE public.market_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_key text NOT NULL,
  rate_pct numeric(5,3) NOT NULL,
  as_of_date date NOT NULL,
  source text NOT NULL,
  source_url text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series_key, as_of_date)
);

GRANT SELECT ON public.market_rates TO authenticated;
GRANT SELECT ON public.market_rates TO anon;
GRANT ALL ON public.market_rates TO service_role;

ALTER TABLE public.market_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Market rates are readable by everyone"
  ON public.market_rates FOR SELECT
  USING (true);

INSERT INTO public.market_rates (series_key, rate_pct, as_of_date, source, source_url)
VALUES ('pmms30', 6.710, '2026-09-03', 'Freddie Mac PMMS 30-year fixed', 'https://www.freddiemac.com/pmms/docs/PMMS_history.csv');

ALTER TABLE public.lender_orgs
  ADD COLUMN IF NOT EXISTS scenario_rate_pct numeric(5,3),
  ADD COLUMN IF NOT EXISTS scenario_rate_label text,
  ADD COLUMN IF NOT EXISTS scenario_rate_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS scenario_rate_set_by uuid;

ALTER TABLE public.campaign_sends
  ADD COLUMN IF NOT EXISTS benchmark_rate_pct numeric(5,3),
  ADD COLUMN IF NOT EXISTS benchmark_as_of date,
  ADD COLUMN IF NOT EXISTS benchmark_source text;

ALTER TABLE public.opportunity_actions
  ADD COLUMN IF NOT EXISTS benchmark_rate_pct numeric(5,3),
  ADD COLUMN IF NOT EXISTS benchmark_as_of date,
  ADD COLUMN IF NOT EXISTS benchmark_source text;