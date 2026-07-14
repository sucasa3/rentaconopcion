
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS metro text;
ALTER TABLE public.pro_coverage ADD COLUMN IF NOT EXISTS metro text;
ALTER TABLE public.rr_cursor ADD COLUMN IF NOT EXISTS metro text;

-- Allow pro_coverage rows keyed by metro (in addition to existing zip rows).
CREATE UNIQUE INDEX IF NOT EXISTS pro_coverage_pro_cat_metro_uidx
  ON public.pro_coverage (pro_id, category, metro)
  WHERE metro IS NOT NULL;

-- Round-robin cursor per (category, metro).
CREATE UNIQUE INDEX IF NOT EXISTS rr_cursor_cat_metro_uidx
  ON public.rr_cursor (category, metro)
  WHERE metro IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_requests_metro_idx ON public.service_requests (metro);
CREATE INDEX IF NOT EXISTS pro_coverage_metro_idx ON public.pro_coverage (category, metro) WHERE metro IS NOT NULL;
