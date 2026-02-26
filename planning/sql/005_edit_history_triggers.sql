-- ============================================================
-- Genealogy Tracker — Edit History Triggers Migration 005
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Run AFTER 001_schema.sql
-- ============================================================

-- ─── RLS policies for edit_history ───────────────────────────────────────────
-- Triggers run SECURITY DEFINER so they bypass RLS for INSERT.
-- Editors and admins can SELECT; nobody can INSERT/UPDATE/DELETE directly.

ALTER TABLE edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "edit_history: editors can read" ON edit_history;
CREATE POLICY "edit_history: editors can read"
  ON edit_history FOR SELECT
  USING (is_editor());

-- ─── Trigger function ─────────────────────────────────────────────────────────
-- Records one row per changed field on UPDATE.
-- Records a single _created row on INSERT.
-- Skips metadata fields: id, created_at, updated_at.

CREATE OR REPLACE FUNCTION record_edit_history()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  old_json JSONB;
  new_json JSONB;
  col      TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    FOR col IN SELECT jsonb_object_keys(new_json) LOOP
      CONTINUE WHEN col IN ('id', 'created_at', 'updated_at');
      IF old_json->col IS DISTINCT FROM new_json->col THEN
        INSERT INTO edit_history
          (table_name, record_id, field_name, old_value, new_value, changed_by)
        VALUES
          (TG_TABLE_NAME, NEW.id, col, old_json->col, new_json->col, auth.uid());
      END IF;
    END LOOP;

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO edit_history
      (table_name, record_id, field_name, old_value, new_value, changed_by)
    VALUES
      (TG_TABLE_NAME, NEW.id, '_created', NULL, to_jsonb(NEW), auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Attach triggers ──────────────────────────────────────────────────────────
-- Drop first so the file is safe to re-run.

DROP TRIGGER IF EXISTS trg_people_edit_history         ON people;
DROP TRIGGER IF EXISTS trg_marriages_edit_history      ON marriages;
DROP TRIGGER IF EXISTS trg_parent_child_edit_history   ON parent_child;
DROP TRIGGER IF EXISTS trg_residences_edit_history     ON residences;
DROP TRIGGER IF EXISTS trg_education_edit_history      ON education;
DROP TRIGGER IF EXISTS trg_occupations_edit_history    ON occupations;
DROP TRIGGER IF EXISTS trg_military_edit_history       ON military_service;

CREATE TRIGGER trg_people_edit_history
  AFTER INSERT OR UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_marriages_edit_history
  AFTER INSERT OR UPDATE ON marriages
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_parent_child_edit_history
  AFTER INSERT OR UPDATE ON parent_child
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_residences_edit_history
  AFTER INSERT OR UPDATE ON residences
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_education_edit_history
  AFTER INSERT OR UPDATE ON education
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_occupations_edit_history
  AFTER INSERT OR UPDATE ON occupations
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();

CREATE TRIGGER trg_military_edit_history
  AFTER INSERT OR UPDATE ON military_service
  FOR EACH ROW EXECUTE FUNCTION record_edit_history();
