-- Rollback for mixed-upload-migration.sql. Turning the flag off is the normal off-switch;
-- run this only to remove the schema. Homes already added stay in books (never purged);
-- held homes stay held (release is always explicit).
DROP FUNCTION IF EXISTS public.approve_upload_spend(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.stage_mixed_upload(uuid, uuid, text, text, jsonb);
-- Keep staged rows unless Neil approves deleting kept contacts:
-- DROP TABLE IF EXISTS public.upload_staged_rows;
-- Columns on contact_import_batches are left in place (additive, harmless).
