# Phase 2 — Person Records Design

**Date:** 2026-02-26
**Status:** Approved
**Spec ref:** planning/spec.md §12 Phase 2

---

## Scope

- `people` CRUD (form-based, no AI yet)
- Relationship linking (parent-child, marriages)
- Person profile page
- Basic search (pg_trgm fuzzy, year range, location)
- Onboarding name-match flow

---

## Architecture Decision

**People store + per-entity composables (Option B)**

`usePeopleStore` owns the paginated list, search state, and core CRUD for the `people` table. Sub-entity data (residences, education, occupations, military) is loaded per-person via focused composables on the profile page. This keeps the store under 200 lines and gives Phase 4 (AI extraction) clean reuse points.

---

## Form Scope

**Core only (Option A)**

`PersonForm.vue` covers only the `people` table fields: name parts, dates, places, bio, notes. Sub-entity editing (residences, education, etc.) happens inline on the profile page after the person exists. Most records will be stubs enriched by AI in Phase 4.

---

## Files

### New files
| File | Purpose |
|------|---------|
| `src/stores/people.ts` | List, search, create, update, delete |
| `src/composables/usePersonDetail.ts` | Fetch full person + all sub-entities |
| `src/composables/useResidences.ts` | CRUD for residences |
| `src/composables/useEducation.ts` | CRUD for education |
| `src/composables/useOccupations.ts` | CRUD for occupations |
| `src/composables/useMilitaryService.ts` | CRUD for military service |
| `src/components/PersonForm.vue` | Create/edit modal — core fields only |
| `src/components/PersonCard.vue` | Mini card for list + search results |
| `src/components/RelationshipPanel.vue` | Add/remove parents, children, spouses |
| `tests/unit/stores/people.test.ts` | Store unit tests |
| `tests/unit/composables/usePersonDetail.test.ts` | Composable unit tests |

### Replaced placeholders
| File | Change |
|------|--------|
| `src/views/PeopleView.vue` | Full searchable list |
| `src/views/PersonView.vue` | Full profile page |
| `src/views/OnboardingView.vue` | Name-match + create-new flow |

---

## Data Flow

```
PeopleView
  └── usePeopleStore (list + search)
        └── PersonCard (per result)
              └── router-link → /people/:id

PersonView (/people/:id)
  └── usePersonDetail(id)
        ├── people row
        ├── useResidences(id)
        ├── useEducation(id)
        ├── useOccupations(id)
        └── useMilitaryService(id)
  └── RelationshipPanel
        └── parent_child + marriages rows
  └── PersonForm (edit mode, emits save)

OnboardingView
  └── pg_trgm name search against people table
        ├── match found → "Is this you?" confirm → set profiles.person_id
        └── no match / skip → mini create form → new person + link
```

---

## Search

- Input in `PeopleView` header — debounced 300ms
- Supabase RPC call to `search_people(query, birth_year_min, birth_year_max, location)` using `pg_trgm` (already enabled in Phase 1 schema)
- Filters: name text, birth year range (two number inputs), location text
- Results sorted by similarity score descending

---

## Relationship Linking

`RelationshipPanel.vue` on the profile page with three tabs: **Parents**, **Children**, **Spouses**.

Each tab:
- Lists existing relationships with remove button (editor/admin only)
- "Add" button opens a person-picker (search + select from people list)
- For parent-child: relationship type dropdown (biological / adopted / step)
- For marriages: optional date + end reason

---

## Onboarding Flow

1. Search `people` by full name (first + last from `profiles` record)
2. Show up to 5 matches as cards (name, birth year, parents if known)
3. "This is me" → `UPDATE profiles SET person_id = $id`
4. "None of these" / "Skip matching" → mini form (first name, last name, birth date, birth place) → `INSERT INTO people` → link
5. "Skip for now" → redirect to `/tree` (can return via `/profile` later)

---

## Testing

- **Store:** list fetch, create, update, delete, search query params
- **usePersonDetail:** assembles all sub-entities correctly, handles missing data
- **Onboarding:** match found path, no-match path, skip path
- All tests written before implementation (TDD)
