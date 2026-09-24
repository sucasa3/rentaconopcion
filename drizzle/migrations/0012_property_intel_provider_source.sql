ALTER TABLE public.property_intel ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.property_intel ADD COLUMN IF NOT EXISTS batchdata_enriched_at timestamptz;
COMMENT ON COLUMN public.property_intel.source IS 'Provider of the current class data: NULL/attom = historical ATTOM cache, batchdata = live BatchData enrichment';
COMMENT ON COLUMN public.property_intel.batchdata_enriched_at IS 'When BatchData last enriched this record; ATTOM-era rows stay NULL and are never treated as fresh BatchData data';