-- ============================================================
-- Genealogy Tracker — Migration 003: Auto-create profile on signup
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Why: signUp() with email confirmation enabled returns no session,
-- so the client cannot insert into profiles (RLS requires auth.uid()).
-- This trigger runs server-side as SECURITY DEFINER and bypasses RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, status, person_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    'viewer',
    'pending',
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
