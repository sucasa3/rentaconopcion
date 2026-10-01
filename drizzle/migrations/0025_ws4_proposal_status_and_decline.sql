ALTER TABLE public.home_documents ADD COLUMN proposals_status text;
ALTER TABLE public.home_documents ADD CONSTRAINT home_documents_proposals_status_chk
  CHECK (proposals_status IS NULL OR proposals_status IN ('pending','applied','dismissed'));
ALTER TABLE public.inspection_batch_files DROP CONSTRAINT ibf_attach_chk;
ALTER TABLE public.inspection_batch_files ADD CONSTRAINT ibf_attach_chk
  CHECK (attach_state IS NULL OR attach_state IN ('attached','pending_permission','no_homeowner','declined'));
COMMENT ON COLUMN public.home_documents.proposals_applied_at IS 'Set when proposals_status leaves pending';