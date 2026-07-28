
-- Extraction status on home_documents
ALTER TABLE public.home_documents
  ADD COLUMN IF NOT EXISTS extraction_status text,
  ADD COLUMN IF NOT EXISTS extraction_error text,
  ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

-- Findings table
CREATE TABLE IF NOT EXISTS public.home_inspection_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.home_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  system text NOT NULL,
  condition text,
  remaining_life_years integer,
  urgency text,
  defects text[] NOT NULL DEFAULT '{}',
  recommended_action text,
  recommended_category text,
  source_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hif_user ON public.home_inspection_findings(user_id);
CREATE INDEX IF NOT EXISTS idx_hif_document ON public.home_inspection_findings(document_id);

GRANT SELECT, DELETE ON public.home_inspection_findings TO authenticated;
GRANT ALL ON public.home_inspection_findings TO service_role;

ALTER TABLE public.home_inspection_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homeowners read own findings"
  ON public.home_inspection_findings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Homeowners delete own findings"
  ON public.home_inspection_findings FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
