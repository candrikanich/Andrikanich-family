-- ============================================================
-- Genealogy Tracker — RLS Policies Migration 002
-- Run AFTER 001_schema.sql
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE people         ENABLE ROW LEVEL SECURITY;
ALTER TABLE marriages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_child   ENABLE ROW LEVEL SECURITY;
ALTER TABLE residences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE education      ENABLE ROW LEVEL SECURITY;
ALTER TABLE occupations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE military_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE media          ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources        ENABLE ROW LEVEL SECURITY;

-- ─── Helper functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_approved()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_editor()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role IN ('editor', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND status = 'approved'
      AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── profiles policies ───────────────────────────────────────────────────────
-- Users can always read and update their own profile (even if pending — so they can see their status)
CREATE POLICY "profiles: own read"     ON profiles FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles: own insert"   ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles: own update"   ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles: admin update" ON profiles FOR UPDATE USING (is_admin());

-- ─── people policies ─────────────────────────────────────────────────────────
CREATE POLICY "people: approved read"  ON people FOR SELECT USING (is_approved());
CREATE POLICY "people: editor insert"  ON people FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "people: editor update"  ON people FOR UPDATE USING (is_editor());
CREATE POLICY "people: admin delete"   ON people FOR DELETE USING (is_admin());

-- ─── marriages policies ───────────────────────────────────────────────────────
CREATE POLICY "marriages: approved read" ON marriages FOR SELECT USING (is_approved());
CREATE POLICY "marriages: editor write"  ON marriages FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "marriages: editor update" ON marriages FOR UPDATE USING (is_editor());
CREATE POLICY "marriages: editor delete" ON marriages FOR DELETE USING (is_editor());

-- ─── parent_child policies ────────────────────────────────────────────────────
CREATE POLICY "parent_child: approved read" ON parent_child FOR SELECT USING (is_approved());
CREATE POLICY "parent_child: editor write"  ON parent_child FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "parent_child: editor update" ON parent_child FOR UPDATE USING (is_editor());
CREATE POLICY "parent_child: editor delete" ON parent_child FOR DELETE USING (is_editor());

-- ─── residences, education, occupations, military_service ────────────────────
CREATE POLICY "residences: approved read" ON residences FOR SELECT USING (is_approved());
CREATE POLICY "residences: editor write"  ON residences FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "residences: editor update" ON residences FOR UPDATE USING (is_editor());
CREATE POLICY "residences: editor delete" ON residences FOR DELETE USING (is_editor());

CREATE POLICY "education: approved read" ON education FOR SELECT USING (is_approved());
CREATE POLICY "education: editor write"  ON education FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "education: editor update" ON education FOR UPDATE USING (is_editor());
CREATE POLICY "education: editor delete" ON education FOR DELETE USING (is_editor());

CREATE POLICY "occupations: approved read" ON occupations FOR SELECT USING (is_approved());
CREATE POLICY "occupations: editor write"  ON occupations FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "occupations: editor update" ON occupations FOR UPDATE USING (is_editor());
CREATE POLICY "occupations: editor delete" ON occupations FOR DELETE USING (is_editor());

CREATE POLICY "military_service: approved read" ON military_service FOR SELECT USING (is_approved());
CREATE POLICY "military_service: editor write"  ON military_service FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "military_service: editor update" ON military_service FOR UPDATE USING (is_editor());
CREATE POLICY "military_service: editor delete" ON military_service FOR DELETE USING (is_editor());

-- ─── documents & media ───────────────────────────────────────────────────────
CREATE POLICY "documents: approved read" ON documents FOR SELECT USING (is_approved());
CREATE POLICY "documents: editor write"  ON documents FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "documents: editor update" ON documents FOR UPDATE USING (is_editor());
CREATE POLICY "documents: editor delete" ON documents FOR DELETE USING (is_editor());

CREATE POLICY "media: approved read" ON media FOR SELECT USING (is_approved());
CREATE POLICY "media: editor write"  ON media FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "media: editor update" ON media FOR UPDATE USING (is_editor());
CREATE POLICY "media: editor delete" ON media FOR DELETE USING (is_editor());

-- ─── edit_history (append-only) ───────────────────────────────────────────────
CREATE POLICY "edit_history: approved read"  ON edit_history FOR SELECT USING (is_approved());
CREATE POLICY "edit_history: editor insert"  ON edit_history FOR INSERT WITH CHECK (is_editor());

-- ─── sources ─────────────────────────────────────────────────────────────────
CREATE POLICY "sources: approved read" ON sources FOR SELECT USING (is_approved());
CREATE POLICY "sources: editor write"  ON sources FOR INSERT WITH CHECK (is_editor());
CREATE POLICY "sources: editor update" ON sources FOR UPDATE USING (is_editor());
CREATE POLICY "sources: editor delete" ON sources FOR DELETE USING (is_editor());

-- ─── Storage bucket policies ─────────────────────────────────────────────────
-- Note: if buckets were already created manually in the UI, comment out the INSERT lines

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', false);

CREATE POLICY "documents: approved read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND is_approved());

CREATE POLICY "documents: editor upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND is_editor());

CREATE POLICY "documents: editor delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND is_editor());

CREATE POLICY "media: approved read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media' AND is_approved());

CREATE POLICY "media: editor upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND is_editor());

CREATE POLICY "media: editor delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND is_editor());
