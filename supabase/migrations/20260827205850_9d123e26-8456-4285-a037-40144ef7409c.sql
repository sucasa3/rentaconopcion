ALTER TABLE public.batchdata_test_results
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_retry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_duplicate_address boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cache_hit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'lookup_all_attributes',
  ADD COLUMN IF NOT EXISTS home_index integer,
  ADD COLUMN IF NOT EXISTS coverage jsonb,
  ADD COLUMN IF NOT EXISTS completeness text;

ALTER TABLE public.batchdata_test_runs
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'batchdata',
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS attom_call_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_record_count integer;