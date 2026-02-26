# Phase 5 — Media & Polish Design

**Date:** 2026-02-26
**Status:** Approved
**Scope:** Photo gallery, Edit history/audit log, PDF export
**Deferred:** GEDCOM import → Phase 7 (Admin & Launch)

---

## Feature 1 — Photo Gallery

### Storage
- Existing `media` bucket (private, created in migration 004)
- Existing `media` table (schema in migration 001)
- Existing `Media` type in `src/types/index.ts`

### Upload Flow
- Drag-drop or file picker on PersonView (editors only)
- Accepted MIME types: image/jpeg, image/png, image/webp
- On upload: store file to `media` bucket → insert row into `media` table
- If this is the first photo for the person, also set `people.primary_photo_id`

### Gallery UI
- Grid of photo thumbnails on PersonView, below the biography section
- Caption + approximate year displayed if set
- Hover reveals "Set as primary" + "Delete" action buttons (editors only)
- Click thumbnail → lightbox with full-size image

### Primary Photo
- First photo uploaded auto-sets as primary (`people.primary_photo_id`)
- "Set as primary" button on any photo promotes it → updates `people.primary_photo_id`
- Primary photo displayed in PersonView header (replacing placeholder avatar)
- Primary photo shown on tree nodes (already wired via `primaryPhotoId` on `TreePerson`)

### New Code
- `src/composables/useMedia.ts` — fetch, upload, delete, setPrimary
- `src/components/PhotoGallery.vue` — grid display, lightbox, upload dropzone

---

## Feature 2 — Edit History / Audit Log

### Writing: PostgreSQL Triggers
- New migration: `planning/sql/005_edit_history_triggers.sql`
- Trigger function captures field-level diffs on UPDATE
- Fires on: `people`, `marriages`, `parent_child`, `residences`, `education`, `occupations`, `military_service`
- Each changed field → one row in `edit_history` with `old_value` (JSONB), `new_value` (JSONB), `changed_by = auth.uid()`, `changed_at = NOW()`
- INSERT events recorded with `old_value = NULL`
- DELETE events recorded with `new_value = NULL`

### Viewing
- Collapsible "Edit History" section at bottom of PersonView
- Visible to editors and admins only
- Shows: field name, old value → new value, who changed it (profile name), timestamp
- Paginated — last 50 entries by default
- New composable: `src/composables/useEditHistory.ts`

### Restore (Admins Only)
- Each history row has a "Restore" button (admin only)
- Clicking restore writes `old_value` back to the record
- The restore itself creates a new `edit_history` entry (via trigger)

---

## Feature 3 — PDF Export

### Mechanism
- `window.print()` triggered by "Export PDF" button on PersonView
- No server code, no dependencies

### Print CSS
- `@media print` rules added to `src/style.css`
- Hides: site header, navigation, action buttons, edit modal, relationship add forms
- Shows: full person profile content (name, vitals, biography, residences, education, career, military, relationships, photo)
- Clean single-column layout, suitable for A4/Letter paper

### UX
- Button label: "Export PDF"
- Browser print dialog opens; user selects "Save as PDF"
- No filename control (browser default)

---

## What's Not Changing
- No new routes required
- No new Supabase Edge Functions
- No changes to existing stores (edit history writes are trigger-driven)
- `media` bucket RLS policies already correct from migration 004
