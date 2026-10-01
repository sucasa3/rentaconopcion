ALTER TABLE public.home_predicted_actions
  ADD COLUMN IF NOT EXISTS source_filename text,
  ADD COLUMN IF NOT EXISTS inspection_date date,
  ADD COLUMN IF NOT EXISTS source_pages integer[],
  ADD COLUMN IF NOT EXISTS needs_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;