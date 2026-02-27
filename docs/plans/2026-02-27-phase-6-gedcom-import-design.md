# Phase 6 — GEDCOM Import Design

**Date:** 2026-02-27
**Status:** Approved
**Spec Reference:** §7.7, §12 (Phase 6)

---

## Decisions

| Question | Decision |
|---|---|
| FamilySearch integration | **Deferred** — no developer credentials available yet |
| GEDCOM parsing | **Client-side** using `parse-gedcom` npm package |
| Conflict handling | **Flag & skip** — import non-conflicts, list conflicts for manual review |
| Deployment required | No — app is local only; no server-side routes needed |

---

## Architecture

```
GedcomImportView
  │
  ├─ File picker (.ged, max 50MB)
  ├─ Parse with parse-gedcom → GedcomRecord[]
  ├─ Map to ImportPreview { people[], relationships[], conflicts[] }
  ├─ Preview screen (counts + sample table)
  ├─ Editor confirms → bulk insert to Supabase
  └─ Done screen (X created, Y skipped as conflicts)
```

Conflict detection matches on `(first_name + last_name + birth_year)`. Conflicting records are listed after import with a link to the existing person for manual comparison.

---

## Data Mapping

| GEDCOM Tag | Maps to |
|---|---|
| `INDI` | `people` row |
| `NAME` | `first_name` + `last_name` (split on `/surname/`) |
| `BIRT DATE` | `birth_date` |
| `BIRT PLAC` | `birth_place` |
| `DEAT DATE` | `death_date` |
| `DEAT PLAC` | `death_place` |
| `BURI PLAC` | `burial_place` |
| `NOTE` | `notes` |
| `FAM HUSB/WIFE` | `marriages` record |
| `FAM CHIL` | `parent_child` records |
| `FAM MARR DATE/PLAC` | `marriage_date`, `marriage_place` |

Fields **not imported** (no GEDCOM equivalents): `residences`, `education`, `military_service`, `occupations` — these come from document extraction.

All imported `parent_child` rows have `confirmed = true` (GEDCOM data is human-created, not AI-suggested).

---

## UI Flow

### Step 1 — Upload (`/import/gedcom`)
- Drag-and-drop or file picker, `.ged` only, max 50MB
- "Parse" button → client-side parse
- Error state if malformed

### Step 2 — Preview
- Summary card: "Found 247 people, 89 families, 12 conflicts"
- Scrollable table: first 20 sample people (name, birth year, death year)
- Conflicts list: "John Smith (b. 1920) — already exists in database"
- Buttons: **"Import (235 people)"** and **Cancel**

### Step 3 — Importing
- Progress bar + status text ("Importing people… 150 / 235")

### Step 4 — Done
- "Import complete: 235 people added, 12 skipped (conflicts)"
- Link to People list
- Conflicts listed for manual review

**Access:** Editor + Admin only.

---

## Files

| File | Action |
|---|---|
| `src/composables/useGedcomImport.ts` | Parse → map → conflict detect → insert |
| `src/views/GedcomImportView.vue` | 4-step import UI |
| `src/router/index.ts` | Add `/import/gedcom` route (editor+) |
| `src/views/admin/AdminView.vue` | Add "Import GEDCOM" nav link |
| `tests/unit/composables/useGedcomImport.test.ts` | Unit tests |

**New dependency:** `parse-gedcom` (pure JS, no server required)
**SQL migrations:** None — all tables already exist.
