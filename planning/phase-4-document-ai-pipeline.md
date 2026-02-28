# Phase 4 — Document AI Pipeline

**Status:** Pending approval
**Date:** 2026-02-26
**Spec Reference:** §6, §7.4, §13

---

## Requirements Restatement

Build a full document ingestion pipeline:

1. Editor uploads a `.docx`, `.doc`, or `.pdf` file and links it to a person
2. File is stored in Supabase Storage immediately
3. A Supabase Edge Function extracts raw text from the file and sends it to **Claude Haiku** with a strict JSON schema
4. Claude returns structured data matching the `people` schema, with uncertain fields flagged
5. A **Review Screen** shows all extracted fields pre-populated — uncertain fields highlighted, side-by-side with the original document
6. Editor reviews, corrects, and confirms — data is committed to the DB
7. Mentioned names (parents, children, siblings, spouse) are shown as **relationship suggestions** — editor confirms or rejects each

Key constraints from §13:
- Documents are **structured label-value pairs** (not narrative prose) → extraction is highly reliable
- Uncertainty notation is `name??` → flag as `uncertain: true` on the field
- Siblings are derived from shared parents, not explicit relationships

---

## Architecture Overview

```
Browser
  │
  ├─ Upload file → Supabase Storage (immediate)
  ├─ Insert documents row (status: pending)
  │
  └─ POST /functions/v1/extract-document
          │
          ├─ Download file from Storage
          ├─ Extract text (mammoth for .docx, pdfjs for .pdf)
          ├─ Call Claude Haiku (structured prompt + JSON schema)
          └─ Return ExtractionResult JSON
                │
                └─ Review Screen (frontend)
                        │
                        ├─ Edit fields inline
                        ├─ Confirm → write to people + related tables
                        └─ Relationship suggestions → confirm/reject
```

---

## Implementation Steps

### Step 1 — Supabase Storage + SQL Migration

**Files:** `planning/sql/004_storage_and_documents.sql`
**Manual:** Create buckets in Supabase dashboard
**Complexity:** Low

SQL migration:
- Enable `pg_trgm` extension (for name fuzzy-search in relationship suggestions)
- Add storage bucket RLS helper: editors can INSERT to `documents` and `media` buckets; all approved users can SELECT

Manual Supabase dashboard steps (documented in the plan):
- Create `documents` bucket (private)
- Create `media` bucket (private)
- Set max file size: 50 MB for documents, 20 MB for media

No changes to existing schema — `documents` and `media` tables already exist.

---

### Step 2 — TypeScript Types

**File:** `src/types/index.ts` (add types)
**Complexity:** Low

Add:

```ts
// What Claude Haiku returns
interface ExtractedField<T = string> {
  value: T
  uncertain: boolean
}

interface ExtractionResult {
  person: {
    firstName: ExtractedField
    lastName: ExtractedField
    birthSurname?: ExtractedField
    nickname?: ExtractedField
    suffix?: ExtractedField
    nameVariants?: string[]
    birthDate?: ExtractedField
    birthPlace?: ExtractedField
    deathDate?: ExtractedField
    deathPlace?: ExtractedField
    burialPlace?: ExtractedField
    biography?: string
    notes?: string  // cross-references ("See William Frances...")
  }
  residences: Array<{
    location: string
    fromDate?: string
    toDate?: string
    isCurrent: boolean
  }>
  education: Array<{
    institution: string
    institutionType: 'high_school' | 'college' | 'university' | 'vocational' | 'other'
    startYear?: number
    endYear?: number
    graduated?: boolean
  }>
  occupations: Array<{
    employer?: string
    title?: string
    fromDate?: string
    toDate?: string
    isCurrent: boolean
  }>
  militaryService: Array<{
    branch: string
    rank?: string
    fromDate?: string
    toDate?: string
    notes?: string
  }>
  marriages: Array<{
    spouseName: string
    marriageDate?: ExtractedField
    marriagePlace?: ExtractedField
    endDate?: string
    endReason?: 'divorced' | 'widowed' | 'annulled'
  }>
  mentionedNames: Array<{
    name: string
    relationshipType: 'parent' | 'child' | 'sibling' | 'spouse'
    mentionContext: string   // e.g. "Mother: Mary Smith"
    uncertain: boolean
  }>
}

// A relationship suggestion after matching against existing people
interface RelationshipSuggestion {
  mentionedName: string
  relationshipType: 'parent' | 'child' | 'sibling' | 'spouse'
  mentionContext: string
  uncertain: boolean
  matchedPerson?: PersonSummary   // null if no DB match found
}
```

---

### Step 3 — Documents Store

**File:** `src/stores/documents.ts`
**Complexity:** Medium

Actions:
- `uploadDocument(personId, file)` — upload to Storage + insert DB row + call Edge Function → returns `ExtractionResult`
- `fetchDocuments(personId)` — list all documents for a person
- `commitExtraction(documentId, result, personId)` — write all reviewed data to DB (person fields + related tables) + set `extraction_status = 'committed'`
- `dismissDocument(documentId)` — set `extraction_status = 'reviewed'` without committing (skip this doc)

State:
- `documents: Document[]`
- `uploading: boolean`
- `extracting: boolean`
- `error: string | null`
- `currentResult: ExtractionResult | null`

The `commitExtraction` action writes to multiple tables in a single transaction:
1. `PATCH /people/:id` — core person fields (only overwrite if field is empty or user chose to overwrite)
2. INSERT into `residences`, `education`, `occupations`, `military_service`
3. `documents.extraction_status = 'committed'`

---

### Step 4 — Edge Function: `extract-document`

**File:** `supabase/functions/extract-document/index.ts`
**Complexity:** High

Logic:
1. Verify caller is authenticated + editor role (check JWT, call `is_editor()`)
2. Receive `{ documentId }` in request body
3. Fetch `documents` row to get `storage_path` and `mime_type`
4. Download file bytes from Supabase Storage (service role key)
5. Extract text:
   - `.docx` / `.doc` → `npm:mammoth` (text extraction mode, not HTML)
   - `.pdf` → `npm:pdfjs-dist/legacy/build/pdf.mjs` (extract text from all pages)
6. Call Claude Haiku with the system prompt + document text
7. Parse and validate the JSON response
8. Return `ExtractionResult` to caller

**Claude Haiku prompt strategy:**

System prompt defines the strict JSON schema (as above). Include:
- Instruction to look for `name??` patterns and set `uncertain: true`
- Instruction to capture everything in `mentionedNames` (Mother, Father, Children, Siblings, Married)
- Example of the label-value format so Haiku understands the doc structure
- Instruction: if a field is not present in the document, omit it (don't invent data)

Environment variables needed:
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL` (already available in Edge Functions)
- `SUPABASE_SERVICE_ROLE_KEY` (already available)

---

### Step 5 — Upload View

**File:** `src/views/UploadView.vue`
**Complexity:** Medium

UI flow:
1. **Person selector** — search/select which person this document belongs to (reuse existing people search)
2. **Drop zone** — drag-and-drop or file picker, accept `.docx,.doc,.pdf`, max 50 MB
3. **Upload button** — disabled until person + file selected
4. **Progress states:**
   - `idle` → `uploading` (file → Storage) → `extracting` (Edge Function call) → `review`
   - Progress indicator with status text at each stage
5. On completion → navigate to `/documents/:id/review` with the extraction result in state (or re-fetch)

Error handling:
- File too large → inline error
- Unsupported type → inline error
- Extraction failure → show error + allow retry or skip extraction

---

### Step 6 — Review Screen

**File:** `src/views/DocumentReviewView.vue`
**Complexity:** High

Two-column layout (desktop) / stacked (mobile):

**Left column — Extracted Fields:**
- Person core fields (name, birth, death, burial) — each as an editable input
- Uncertain fields: yellow highlight + `?` badge
- Sections: Residences (list), Education (list), Occupations (list), Military (list), Marriages (list)
- Each list section: add/remove rows
- **Commit** button at bottom → calls `commitExtraction()`

**Right column — Document Preview:**
- For `.docx`: render extracted text as pre-formatted plain text (monospace, scrollable)
- For `.pdf`: `<embed>` or `<iframe>` with the Storage URL (signed URL, 1 hour expiry)
- Allows editor to refer to the source while reviewing fields

**Relationship Suggestions section** (below main form, full-width):
- Shows `mentionedNames` from extraction
- For each: search existing `people` by name (fuzzy, using existing people store search)
- Show match confidence + person card preview
- Actions: "Confirm Link" / "Create New Person" / "Skip"
- "Confirm Link" → INSERT into `parent_child` or `marriages` (based on `relationshipType`)

Navigation guard: warn if user tries to leave with uncommitted changes.

---

### Step 7 — Relationship Suggestion Component

**File:** `src/components/RelationshipSuggestions.vue`
**Complexity:** Medium

Props: `suggestions: RelationshipSuggestion[]`, `subjectPersonId: string`

For each suggestion:
1. Search `people` by name (debounced, reuse people store)
2. Display best match (or "No match found")
3. Three actions:
   - **Link to match** → creates the appropriate relationship record
   - **Create new person** → minimal form (name only required) → creates person + relationship
   - **Skip** → mark suggestion as dismissed (local state only)

Relationship type mapping:
- `parent` → `parent_child` with `parent_id = match.id, child_id = subjectPersonId`
- `child` → `parent_child` with `parent_id = subjectPersonId, child_id = match.id`
- `sibling` → create two `parent_child` records sharing same parent (if parent known) OR skip (complex case)
- `spouse` → `marriages` record

---

### Step 8 — Router Update

**File:** `src/router/index.ts`
**Complexity:** Low

Add routes (requires `approved` + `editor` role):
```
/upload                   → UploadView
/documents/:id/review     → DocumentReviewView
```

Add nav link: "Upload Document" in the main navigation (sidebar or header), visible to editors only.

---

### Step 9 — Tests

**Files:** `tests/unit/stores/documents.test.ts`, `tests/unit/views/UploadView.test.ts`
**Complexity:** Medium

- Documents store: uploadDocument, commitExtraction, error states
- ExtractionResult parsing: uncertain field detection, mentionedNames extraction
- RelationshipSuggestions: correct `parent_child` / `marriages` record construction
- UploadView: file type validation, file size validation, progress state transitions

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| mammoth.js or pdfjs Deno compatibility | High | Test early in Step 4 — if mammoth fails in Deno, fallback: send raw binary to a tiny Vercel API route for extraction |
| Claude Haiku returns malformed JSON | Medium | Wrap Haiku call in retry (x2) + validate schema with Zod; show error if still invalid |
| Large PDF causes Edge Function timeout (default 60s) | Medium | Cap PDF pages at 20; warn user if doc exceeds limit |
| Relationship suggestions produce wrong links | Low | All suggestions require human confirmation — no auto-commit |
| Storage signed URL expires during review | Low | Generate fresh signed URL on DocumentReviewView mount |

---

## File Checklist

| File | Action |
|------|--------|
| `planning/sql/004_storage_and_documents.sql` | Create |
| `src/types/index.ts` | Add ExtractionResult, RelationshipSuggestion |
| `src/stores/documents.ts` | Create |
| `supabase/functions/extract-document/index.ts` | Create |
| `src/views/UploadView.vue` | Create |
| `src/views/DocumentReviewView.vue` | Create |
| `src/components/RelationshipSuggestions.vue` | Create |
| `src/router/index.ts` | Add 2 routes + editor guard |
| `tests/unit/stores/documents.test.ts` | Create |
| `tests/unit/views/UploadView.test.ts` | Create |

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Deno + mammoth | Use `npm:mammoth` in Supabase Edge Function; fallback to Vercel API route for text extraction if Deno compatibility fails |
| Sibling suggestions | Auto-suggest: create two `parent_child` records linking sibling to the subject person's known parents |
| Overwrite policy | Per-field **replace / keep** toggle in the review screen; existing values shown alongside extracted values |

---

**APPROVED — ready to implement.**
