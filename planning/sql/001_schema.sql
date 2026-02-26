-- ============================================================
-- Genealogy Tracker — Schema Migration 001
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Fuzzy search extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Profiles (extends auth.users) ───────────────────────────────────────────
CREATE TABLE profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'editor', 'viewer')),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'denied')),
  person_id   UUID,   -- FK added after people table
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── People ──────────────────────────────────────────────────────────────────
CREATE TABLE people (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  birth_surname    TEXT,
  nickname         TEXT,
  name_variants    TEXT[] NOT NULL DEFAULT '{}',
  suffix           TEXT,
  birth_date       DATE,
  birth_place      TEXT,
  death_date       DATE,
  death_place      TEXT,
  burial_place     TEXT,
  notes            TEXT,
  biography        TEXT,
  primary_photo_id UUID,   -- FK added after media table
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add person_id FK to profiles
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_person
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL;

-- ─── Marriages ────────────────────────────────────────────────────────────────
CREATE TABLE marriages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_a_id     UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  person_b_id     UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  marriage_date   DATE,
  marriage_place  TEXT,
  end_date        DATE,
  end_reason      TEXT CHECK (end_reason IN ('divorced', 'widowed', 'annulled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Parent-Child ─────────────────────────────────────────────────────────────
CREATE TABLE parent_child (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id         UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  child_id          UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'biological'
                      CHECK (relationship_type IN ('biological', 'adopted', 'step', 'half')),
  confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, child_id)
);

-- ─── Residences ───────────────────────────────────────────────────────────────
CREATE TABLE residences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  location   TEXT NOT NULL,
  from_date  DATE,
  to_date    DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ─── Education ────────────────────────────────────────────────────────────────
CREATE TABLE education (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  institution      TEXT NOT NULL,
  institution_type TEXT NOT NULL DEFAULT 'other'
                     CHECK (institution_type IN ('high_school', 'college', 'university', 'vocational', 'other')),
  location         TEXT,
  start_year       INTEGER,
  end_year         INTEGER,
  graduated        BOOLEAN,
  notes            TEXT
);

-- ─── Occupations ──────────────────────────────────────────────────────────────
CREATE TABLE occupations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  employer   TEXT,
  title      TEXT,
  from_date  DATE,
  to_date    DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE
);

-- ─── Military Service ─────────────────────────────────────────────────────────
CREATE TABLE military_service (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  branch     TEXT,
  rank       TEXT,
  from_date  DATE,
  to_date    DATE,
  notes      TEXT
);

-- ─── Documents ────────────────────────────────────────────────────────────────
CREATE TABLE documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id          UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  storage_path       TEXT NOT NULL,
  original_filename  TEXT NOT NULL,
  mime_type          TEXT NOT NULL,
  uploaded_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  extraction_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (extraction_status IN ('pending', 'reviewed', 'committed'))
);

-- ─── Media (photos) ───────────────────────────────────────────────────────────
CREATE TABLE media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption     TEXT,
  year_approx INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add primary_photo_id FK to people
ALTER TABLE people
  ADD CONSTRAINT fk_people_primary_photo
  FOREIGN KEY (primary_photo_id) REFERENCES media(id) ON DELETE SET NULL;

-- ─── Edit History ─────────────────────────────────────────────────────────────
CREATE TABLE edit_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  changed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sources ──────────────────────────────────────────────────────────────────
CREATE TABLE sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  citation    TEXT NOT NULL,
  url         TEXT,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_people_last_name    ON people USING gin(last_name gin_trgm_ops);
CREATE INDEX idx_people_first_name   ON people USING gin(first_name gin_trgm_ops);
CREATE INDEX idx_people_birth_surname ON people USING gin(birth_surname gin_trgm_ops);
CREATE INDEX idx_people_user_id      ON people(user_id);
CREATE INDEX idx_parent_child_parent ON parent_child(parent_id);
CREATE INDEX idx_parent_child_child  ON parent_child(child_id);
CREATE INDEX idx_marriages_a         ON marriages(person_a_id);
CREATE INDEX idx_marriages_b         ON marriages(person_b_id);
CREATE INDEX idx_edit_history_record ON edit_history(record_id, changed_at DESC);
CREATE INDEX idx_documents_person    ON documents(person_id);
CREATE INDEX idx_media_person        ON media(person_id);
CREATE INDEX idx_residences_person   ON residences(person_id, sort_order);

-- ─── Updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
