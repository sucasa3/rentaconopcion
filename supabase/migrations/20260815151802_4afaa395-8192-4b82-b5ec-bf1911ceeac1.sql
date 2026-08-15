ALTER TABLE public.homeowner_opportunities
  DROP CONSTRAINT IF EXISTS homeowner_opportunities_category_check;

ALTER TABLE public.homeowner_opportunities
  ADD CONSTRAINT homeowner_opportunities_category_check
  CHECK (category IN ('equity','heloc','refinance_review','move_up','investment','mortgage_review','home_condition','market_timing'));

ALTER TABLE public.homeowner_opportunities
  ADD COLUMN IF NOT EXISTS signal_key text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS confidence numeric;