ALTER TABLE public.homeowner_opportunities
  DROP CONSTRAINT IF EXISTS homeowner_opportunities_state_check;

ALTER TABLE public.homeowner_opportunities
  ADD CONSTRAINT homeowner_opportunities_state_check
  CHECK (state = ANY (ARRAY['open'::text, 'introduced'::text, 'declined'::text, 'expired'::text, 'won'::text, 'dismissed'::text]));