CREATE TABLE public.batchdata_test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  created_by UUID REFERENCES auth.users,
  status TEXT NOT NULL DEFAULT 'running',
  submitted_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  api_request_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.batchdata_test_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_run_id UUID NOT NULL REFERENCES public.batchdata_test_runs(id) ON DELETE CASCADE,
  source_contact_id UUID,
  source_label TEXT,
  input_address TEXT NOT NULL,
  address_normalized TEXT,
  provider TEXT NOT NULL DEFAULT 'batchdata',
  provider_request_id TEXT,
  provider_property_id TEXT,
  http_status INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  matched BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  duration_ms INTEGER,
  raw_response JSONB,
  normalized JSONB,
  usage_info JSONB,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_batchdata_test_results_run ON public.batchdata_test_results(test_run_id);

GRANT SELECT ON public.batchdata_test_runs TO authenticated;
GRANT ALL ON public.batchdata_test_runs TO service_role;
GRANT SELECT ON public.batchdata_test_results TO authenticated;
GRANT ALL ON public.batchdata_test_results TO service_role;

ALTER TABLE public.batchdata_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batchdata_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view batchdata test runs"
ON public.batchdata_test_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view batchdata test results"
ON public.batchdata_test_results FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_batchdata_test_runs_updated_at
BEFORE UPDATE ON public.batchdata_test_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();