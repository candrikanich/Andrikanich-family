# Genealogy Tracker — Product Specification

**Version:** 1.2
**Date:** 2026-02-26
**Status:** Approved

**Changelog**
- v1.2: Resolved all open questions; expanded data model from example doc analysis; added onboarding self-link flow
- v1.1: Resolved 4 open questions; added External Data Enrichment feature (§7.11, §13)

---

## 1. Overview

A private, invite-gated web application for the Andrikanich family to digitize, explore, and maintain their family history. The primary data source is Word documents (~1 per person) researched by the uncle. The site extracts structured data from those documents using AI, displays it in a visual family tree, and allows family members to contribute and maintain records over time.

---

## 2. Core Principles

- **Private by default** — login required for all content; no public pages
- **Heritage feel** — warm, earthy tones; serif-adjacent fonts; evokes old photographs and family albums
- **Mobile-first reading** — mobile users browse and read; editing is a desktop experience
- **AI-assisted, human-verified** — AI extracts data but a human always reviews before it's saved
- **Authoritative source preserved** — original Word documents stored alongside extracted data

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3.4 + TypeScript + Vite |
| Styling | TailwindCSS |
| State | Pinia |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + password) |
| File Storage | Supabase Storage (docs + photos) |
| AI Extraction | Anthropic Claude Haiku API |
| Hosting | Vercel |
| Email | Supabase + Resend (transactional) |
| Testing | Vitest + Playwright |

---

## 4. User Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Everything. Approve/deny registrations, manage all records, delete any data. |
| **Editor** | Add / edit / delete people, upload documents, link relationships, upload photos. |
| **Viewer** | Read-only. Browse tree, search, view profiles, download their own copies. |

### Registration Flow
1. Admin shares an invite URL (not a single-use token — any family member can use it)
2. Visitor registers with email + password
3. Account is created but marked `pending`
4. Admin receives email notification
5. Admin approves or denies via admin panel
6. User receives email confirming access

---

## 5. Data Model

### `people`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| first_name | text | |
| last_name | text | Current surname |
| birth_surname | text | Maiden name / birth surname |
| nickname | text | Known-as name (e.g. "Bill" for "William") |
| name_variants | text[] | Alternate spellings (e.g. "Andrikanitch") |
| suffix | text | Jr, Sr, III, etc. |
| birth_date | date | |
| birth_place | text | City, region, country |
| death_date | date | nullable |
| death_place | text | nullable |
| burial_place | text | nullable |
| notes | text | Free-form notes, uncertainties, cross-references (e.g. "See William Frances Andrikanich") |
| biography | text | Narrative text (extracted from doc or written) |
| primary_photo_id | uuid | FK → `media` |
| user_id | uuid | FK → `auth.users`, nullable — set when a registered user links to this record |
| created_by | uuid | FK → `users` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `residences`
Tracks all places a person has lived, in order.

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| person_id | uuid | FK → `people` |
| location | text | City, county, state, country |
| from_date | date | nullable |
| to_date | date | nullable |
| is_current | boolean | true = current residence |
| sort_order | integer | Display order |

### `education`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| person_id | uuid | FK → `people` |
| institution | text | School/university name |
| institution_type | enum | high_school, college, university, vocational, other |
| location | text | nullable |
| start_year | integer | nullable |
| end_year | integer | nullable |
| graduated | boolean | nullable |
| notes | text | nullable |

### `occupations`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| person_id | uuid | FK → `people` |
| employer | text | nullable |
| title | text | nullable |
| from_date | date | nullable |
| to_date | date | nullable |
| is_current | boolean | |

### `military_service`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| person_id | uuid | FK → `people` |
| branch | text | Army, Navy, etc. |
| rank | text | nullable |
| from_date | date | nullable |
| to_date | date | nullable |
| notes | text | nullable |

### `marriages`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| person_a_id | uuid | FK → `people` |
| person_b_id | uuid | FK → `people` |
| marriage_date | date | nullable |
| marriage_place | text | nullable |
| end_date | date | nullable |
| end_reason | enum | married, divorced, widowed, annulled |

### `parent_child`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| parent_id | uuid | FK → `people` |
| child_id | uuid | FK → `people` |
| relationship_type | enum | biological, adopted, step |
| confirmed | boolean | false = AI-suggested, true = human-confirmed |

### `documents`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| person_id | uuid | FK → `people` |
| storage_path | text | Supabase Storage key |
| original_filename | text | |
| mime_type | text | |
| uploaded_by | uuid | FK → `users` |
| uploaded_at | timestamptz | |
| extraction_status | enum | pending, reviewed, committed |

### `media` (photos + attachments)
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| person_id | uuid | FK → `people` |
| storage_path | text | |
| caption | text | nullable |
| year_approx | integer | nullable |
| uploaded_by | uuid | FK → `users` |
| uploaded_at | timestamptz | |

### `edit_history`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| table_name | text | e.g. "people", "marriages" |
| record_id | uuid | The affected row |
| field_name | text | Which field changed |
| old_value | jsonb | Previous value |
| new_value | jsonb | New value |
| changed_by | uuid | FK → `users` |
| changed_at | timestamptz | |

### `sources`
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| person_id | uuid | FK → `people` |
| title | text | e.g. "1920 US Census" |
| citation | text | Full citation text |
| url | text | nullable |
| document_id | uuid | nullable, FK → `documents` |

---

## 6. AI Document Extraction Pipeline

### Flow
1. Editor uploads a `.docx` or `.pdf` file via the upload UI
2. File is stored immediately in Supabase Storage
3. Document text is extracted server-side (Supabase Edge Function or Vercel API route)
4. Extracted text is sent to **Claude Haiku** with a structured prompt requesting:
   - Full name (first, last, birth surname, nickname, suffix, variants)
   - Birth date + place, death date + place, burial place
   - All marriages: spouse name, marriage date/place, end date/reason
   - Biographical narrative summary
   - Mentioned names (potential relatives) for relationship suggestion
5. Claude returns a JSON payload matching the `people` schema
6. UI displays a **Review Screen** with all extracted fields pre-populated
7. Editor reviews, corrects any mistakes, and confirms
8. Data is committed to the database
9. Mentioned names are shown as **suggested relationships** — editor confirms or rejects each one

### Prompt Strategy
- System prompt defines the expected JSON schema strictly
- Include example document snippets for few-shot context
- Flag uncertain fields (low confidence) so the UI can highlight them
- For names mentioned in the document, return them with a `mention_context` so the editor knows why a link is being suggested

---

## 7. Features

### 7.1 Family Tree (Primary View)
- **Default view**: Ancestor chart centered on a selected root person
- Toggle to descendant view available
- Pan + zoom (touch and mouse)
- Each node shows: name, birth year – death year, small photo (if available)
- Unconfirmed (AI-suggested) relationships shown with a dashed border
- Click a node → slide-over panel opens from right
- Slide-over shows: full profile, quick links to parents/children/spouses, photo gallery thumbnail, edit button

### 7.2 Person Profile (Slide-over + Full Page)
- **Slide-over** (tree context): key details, relationships, mini gallery, "View Full Profile" link
- **Full page**: complete biography, all marriages, all children, full photo gallery, source citations, attached documents, edit history

### 7.3 Search
- Global search bar (header, always visible)
- Search by: full name (first, last, maiden, nickname, variants), birth/death year range, birthplace/location
- Relationship filter: "Show all descendants of [person]"
- Results as a sortable list with mini-cards (name, dates, photo thumbnail)

### 7.4 Document Upload & AI Extraction
- Drag-and-drop or file picker
- Accepts: `.docx`, `.doc`, `.pdf`
- Progress indicator during extraction
- Review screen with field-by-field preview
- Uncertain fields highlighted
- Side-by-side: extracted fields (left) + original document preview (right)

### 7.5 Photo Gallery
- Per-person photo gallery
- Primary photo displayed on tree node and profile header
- Upload from desktop or mobile camera
- Optional caption and approximate year per photo

### 7.6 Edit History / Audit Log
- Every field change recorded
- Viewable per-person by editors/admins
- "Restore previous value" action for admins

### 7.7 GEDCOM Import
- Upload a `.ged` file
- Parse and preview: how many people found, sample records
- Confirm import → bulk create `people` records and relationships
- Merges with existing data by matching on full name + birth year (flag conflicts for human review)

### 7.8 PDF Export (Person Profile Report)
- One-page formatted report per person
- Includes: photo, vital stats, biography, parents, marriages + children, sources
- Generated server-side, downloadable as PDF

### 7.9 Admin Panel
- Pending registration approvals (list + approve/deny)
- User management (view all users, change roles, deactivate)
- Activity log (recent uploads, edits, new people)

### 7.10 External Data Enrichment
See §11 for full specification. Summary: manual-trigger button on each person profile, FamilySearch as the first provider, results always reviewed by a human before any field is applied.

### 7.11 Registration & Auth
- Email + password registration
- Invite URL on the registration page (no magic link, just a known URL)
- Admin approval required before access granted
- Admin receives email on new registration
- Password reset via email

---

## 8. Navigation Structure

```
/ (root) → redirects to /login if unauthenticated
/login
/register

(authenticated)
/tree               ← home after login, interactive family tree
/people             ← paginated list / search results
/people/:id         ← full person profile
/upload             ← document upload + AI extraction flow
/admin              ← admin panel (admin role only)
/profile            ← current user's own settings
```

---

## 9. Visual Design Direction

- **Color palette**: warm cream/ivory backgrounds, deep walnut brown for text, dusty rose or sage green as accent
- **Typography**: serif or serif-adjacent display font for headings (e.g. Playfair Display), clean sans-serif body (e.g. Inter)
- **Tree nodes**: rounded cards with subtle drop shadow, aged-paper texture or warm gradient
- **Imagery**: family photo frames with thin borders, subtle grain texture overlays
- **Mobile**: bottom navigation bar with: Tree, Search, Upload, Profile

---

## 10. Infrastructure Additions Recommended

| Service | Purpose | Why |
|---------|---------|-----|
| **Resend** | Transactional email (registration notifications, password reset) | Supabase built-in email has low sending limits; Resend is free tier generous and reliable |
| **Vercel Edge Functions** | Run AI extraction serverlessly | Keep Claude API key server-side; avoids exposing it in the browser |
| **Supabase Row Level Security (RLS)** | Enforce `pending` users can't see data | Database-level enforcement, not just UI |
| **Sentry** | Error monitoring | Catch AI extraction failures and frontend errors silently |
| **Supabase pg_trgm extension** | Fuzzy name search | Handles variant spellings in search (e.g. "Andrikanitch" finds "Andrikanich") |

---

## 11. External Data Enrichment

### Concept
Each person's profile has an **"Enrich from External Sources"** button (editor/admin only). When clicked, the system queries configured external genealogy APIs using the person's name and birth/death details, then displays results for human review. **Nothing is ever written to the database automatically.**

### Phase 1 Integration: FamilySearch

FamilySearch has a free, documented REST API (oauth2 + API key). It is the most practical external genealogy source available without a paid partnership.

**Lookup flow:**
1. Editor clicks "Enrich from External Sources" on a person's profile
2. A panel opens showing "Searching FamilySearch..."
3. The app queries FamilySearch `/platform/tree/persons-search` with:
   - `q.givenName`, `q.surname`, `q.birthDate`, `q.birthPlace`, `q.deathDate`
4. Results (list of candidate matches) are shown in a review panel:
   - Each match shows: FamilySearch name, dates, places, confidence score
   - A diff view compares the FamilySearch data against the current record field by field
5. Editor can cherry-pick individual fields to apply (`Use this value`)
6. Applied values are saved with a source citation linking back to the FamilySearch person ID
7. If no useful data found, editor dismisses the panel — nothing changes

### Data Shape: `external_enrichment_results`

This is a temporary UI state — not stored in the database. The only thing persisted is the **source citation** if the editor applies a value.

```ts
interface EnrichmentResult {
  source: 'familysearch'
  external_id: string        // FamilySearch person ID
  confidence: number         // 0–100
  fields: {
    field_name: string       // e.g. 'birth_date', 'birth_place'
    external_value: string
    current_value: string | null
    conflict: boolean        // true if values differ
  }[]
  url: string                // Direct link to the FamilySearch record
}
```

### Source Citation Auto-created on Apply
When a field is applied from FamilySearch, a `sources` record is created:
```
title: "FamilySearch — [Person Name]"
citation: "FamilySearch Family Tree, [FamilySearch Person ID], accessed [date]"
url: "https://familysearch.org/tree/person/[id]"
```

### Architecture
- FamilySearch API calls are made server-side (Vercel Edge Function) — keeps the OAuth token out of the browser
- FamilySearch requires OAuth 2.0 client credentials — stored in Vercel environment variables
- Rate limiting: FamilySearch allows generous limits for non-commercial use; no special throttling needed at family scale (<500 people)

### Future Sources (Plugin Architecture)
The enrichment system is built with a provider interface so additional sources can be added later:

```ts
interface EnrichmentProvider {
  id: string                  // e.g. 'familysearch', 'findagrave'
  name: string
  search(person: PersonSearchParams): Promise<EnrichmentResult[]>
}
```

Possible future providers: FindAGrave (headstone photos), WikiTree (open family tree), Billiongraves.

---

## 12. Implementation Phases

### Phase 1 — Foundation
- Supabase project setup + schema migration
- Supabase Auth + RLS policies
- Admin approval flow + Resend email
- Login / Register views

### Phase 2 — Person Records
- `people` CRUD (form-based, no AI yet)
- Relationship linking (parent-child, marriages)
- Person profile page
- Basic search

### Phase 3 — Family Tree
- Interactive tree visualization (ancestor + descendant views)
- Slide-over panel
- Pan / zoom

### Phase 4 — Document AI Pipeline
- File upload + Supabase Storage
- Claude Haiku extraction (Edge Function)
- Review screen
- Relationship suggestion confirmation

### Phase 5 — Media & Polish
- Photo gallery per person
- Edit history / audit log
- PDF export
- GEDCOM import

### Phase 6 — External Enrichment
- FamilySearch OAuth2 integration (Vercel Edge Function)
- Enrichment review panel on person profiles
- Source citation auto-creation on field apply
- Provider interface for future sources

### Phase 7 — Admin & Launch
- Admin panel
- Pending user approval flow
- Mobile polish
- Sentry integration
- Custom domain on Vercel

---

## 12. User Onboarding: Self-Link Flow

After admin approves a new registration, the user completes a one-time onboarding step to link their account to their person record.

### Flow
1. First login after approval → onboarding screen
2. App searches `people` table for records matching the user's registered name (full-text, fuzzy)
3. Matches are shown as cards: name, birth year, parents (for disambiguation)
4. **If a match is found:**
   - "Is this you?" confirmation prompt
   - User confirms → `people.user_id` is set to their `auth.users.id`
   - They proceed to the tree
5. **If no match / user declines all matches:**
   - Mini onboarding form: first name, last name, birth date, birth place, parents (optional)
   - A new person record is created and linked to their account
   - Record is visible immediately; an editor/admin can enrich it later
6. Onboarding can be skipped and completed later from profile settings

### Notes
- The search uses `pg_trgm` fuzzy matching to handle typos and name variants
- Only one account can be linked to each person record (enforced by unique constraint on `people.user_id`)
- Admins can manually link/unlink accounts from the admin panel

---

## 13. Document Format Analysis

> Based on review of `/Users/chrisandrikanich/Desktop/CHRISTOPHER WILLIAM ANDRIKANICH.docx`

**Format:** Structured label-value pairs — NOT narrative prose. Labels are consistent keywords followed by colon-separated values. This makes AI extraction highly reliable.

**Confirmed fields present in docs:**
- Full name (header line)
- Born (date + city/state)
- Lived in (comma-separated list of places — historical residences)
- Lives in (current residence)
- Occupation (employer / title)
- Military (branch or "None")
- High School (name + graduation year)
- College (name + years + graduation year)
- Married (spouse name + date + venue/location)
- Mother / Father (full name)
- Children (name + birth date + birth hospital)
- Siblings (name, with half-sibling notation)
- Cross-reference notes ("See [Name] for other info")

**Uncertainty notation:** `name??` — AI should extract this and set a flag so the UI can highlight uncertain data.

**AI extraction prompt approach:**
- Pass the full doc text with a strict JSON schema
- Instruct Claude to preserve uncertainty markers as a `uncertain: true` flag on each field
- Extract `mentioned_names` array for relationship suggestions (parents, children, siblings, spouse)
- Siblings can be suggested as relationship links even though they're derived (children share parents)
- Cross-references ("See [Name]") should be extracted and stored in `people.notes`

---

## 14. Resolved Decisions (All)

| Question | Decision |
|----------|---------|
| Default tree root | Logged-in user's own person record (if linked) |
| Supabase project | Not yet created — create in Phase 1 |
| Domain name | `andrikanichfamily.com` → pointed at Vercel via DNS |
| Source citations | First-class `sources` records in the database |
| Doc format | Structured label-value pairs; consistent across documents |
| User self-link | Search by name → confirm match → or create new record via form |
| FamilySearch account | User will create developer account |

## 15. Open Questions

None — all decisions resolved. Start building.
