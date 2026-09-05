ALTER TABLE public.batchdata_test_results
  ADD COLUMN IF NOT EXISTS request_payload jsonb,
  ADD COLUMN IF NOT EXISTS response_headers jsonb,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS unit_designator text,
  ADD COLUMN IF NOT EXISTS match_confidence text,
  ADD COLUMN IF NOT EXISTS readiness text,
  ADD COLUMN IF NOT EXISTS readiness_reason text;

ALTER TABLE public.batchdata_test_runs
  ADD COLUMN IF NOT EXISTS green_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yellow_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS red_count integer NOT NULL DEFAULT 0;