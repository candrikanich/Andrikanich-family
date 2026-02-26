-- ============================================================
-- Genealogy Tracker — Storage & Document AI Migration 004
-- Run AFTER 001_schema.sql, 002_rls_policies.sql, 003_auto_create_profile.sql
-- ============================================================
--
-- MANUAL SETUP REQUIRED (Supabase Dashboard → Storage):
--   1. Create bucket named "documents" — private, no public access
--      Allowed MIME types: application/pdf, application/msword,
--      application/vnd.openxmlformats-officedocument.wordprocessingml.document
--   2. Create bucket named "media" — private, no public access
--      Allowed MIME types: image/jpeg, image/png, image/webp, image/gif
--
-- Do NOT use the bucket INSERT statements below if the buckets already
-- exist (created via Dashboard). The policies are idempotent via DROP IF EXISTS.
-- ============================================================

-- ─── Fuzzy search extension ───────────────────────────────────────────────────
-- Already enabled in 001_schema.sql. Safe to run again — IF NOT EXISTS is a no-op.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Storage bucket RLS policies — documents bucket ──────────────────────────
-- Drop first so this file is safe to re-run (e.g. after a reset or re-deployment).
DROP POLICY IF EXISTS "documents: approved read"  ON storage.objects;
DROP POLICY IF EXISTS "documents: editor upload"  ON storage.objects;
DROP POLICY IF EXISTS "documents: editor delete"  ON storage.objects;

-- Approved users (viewers, editors, admins) can download / view documents.
CREATE POLICY "documents: approved read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND is_approved());

-- Editors and admins can upload new documents.
CREATE POLICY "documents: editor upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND is_editor());

-- Editors and admins can delete documents (e.g. replace a bad upload).
CREATE POLICY "documents: editor delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND is_editor());

-- ─── Storage bucket RLS policies — media bucket ───────────────────────────────
DROP POLICY IF EXISTS "media: approved read"  ON storage.objects;
DROP POLICY IF EXISTS "media: editor upload"  ON storage.objects;
DROP POLICY IF EXISTS "media: editor delete"  ON storage.objects;

-- Approved users can view photos.
CREATE POLICY "media: approved read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media' AND is_approved());

-- Editors and admins can upload photos.
CREATE POLICY "media: editor upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND is_editor());

-- Editors and admins can delete photos.
CREATE POLICY "media: editor delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND is_editor());
