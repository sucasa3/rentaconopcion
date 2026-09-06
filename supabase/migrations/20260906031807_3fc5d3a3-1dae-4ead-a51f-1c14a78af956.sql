ALTER TABLE public.plan_tiers ADD COLUMN IF NOT EXISTS stripe_test_price_id text;

UPDATE public.plan_tiers SET stripe_price_id = 'price_1UCWVWC1chCB63tpKSgVhBan' WHERE key = 'mlo';
UPDATE public.plan_tiers SET stripe_price_id = 'price_1UCWWRC1chCB63tpDVkD8yKM' WHERE key = 'mlo_growth_v2';
UPDATE public.plan_tiers SET stripe_price_id = 'price_1UCWWeC1chCB63tpSv3qE2Fy' WHERE key = 'branch';
UPDATE public.plan_tiers SET stripe_price_id = 'price_1UCWWsC1chCB63tpi0E2KA2K' WHERE key = 'branch_pro_v2';
UPDATE public.plan_tiers SET stripe_price_id = 'price_1UCWXRC1chCB63tpAutswkof' WHERE key = 'network';
UPDATE public.plan_tiers SET stripe_price_id = 'price_1UCWXoC1chCB63tpWVES1LqJ' WHERE key = 'agent';
UPDATE public.plan_tiers SET stripe_price_id = 'price_1UCWY3C1chCB63tpF4N9ygYa' WHERE key = 'agent_growth';

UPDATE public.addon_products SET stripe_price_id = 'price_1UCWYJC1chCB63tp8dXZ7E9o' WHERE key = 'profiles_500';
UPDATE public.addon_products SET stripe_price_id = 'price_1UCWYjC1chCB63tpoyHuHjwR' WHERE key = 'agent_seats_5';