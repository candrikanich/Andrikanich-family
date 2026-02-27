# Phase 6 — GEDCOM Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GEDCOM file import so editors can bulk-import people and relationships from standard genealogy software.

**Architecture:** Client-side parsing with `parse-gedcom`, pure exported helper functions for mapping/conflict detection, a `useGedcomImport` composable that handles Supabase writes, and a 4-step `GedcomImportView` (upload → preview → importing → done).

**Tech Stack:** Vue 3 + TypeScript, parse-gedcom, Supabase JS client, Vitest

---

## Task 1: Install parse-gedcom

**Files:**
- Modify: `package.json`

**Step 1: Install**

```bash
npm install parse-gedcom
```

**Step 2: Verify build still clean**

```bash
npm run build
```
Expected: build succeeds, no errors.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add parse-gedcom dependency"
```

---

## Task 2: Add GEDCOM types

**Files:**
- Modify: `src/types/index.ts` — append at end of file

**Step 1: Append types**

Add this block at the end of `src/types/index.ts`:

```ts
// ─── GEDCOM Import ────────────────────────────────────────────────────────────

export interface GedcomImportPerson {
  gedcomId: string
  firstName: string
  lastName: string
  birthDate: string | null
  birthPlace: string | null
  deathDate: string | null
  deathPlace: string | null
  burialPlace: string | null
  notes: string | null
}

export interface GedcomImportFamily {
  gedcomId: string
  husbandGedcomId: string | null
  wifeGedcomId: string | null
  childGedcomIds: string[]
  marriageDate: string | null
  marriagePlace: string | null
}

export interface GedcomConflict {
  gedcomPerson: GedcomImportPerson
  existingPersonId: string
  existingPersonName: string
}

export interface GedcomImportPreview {
  people: GedcomImportPerson[]     // non-conflicting only
  families: GedcomImportFamily[]
  conflicts: GedcomConflict[]
}

export interface GedcomImportResult {
  created: number
  skipped: number
  conflicts: GedcomConflict[]
}
```

**Step 2: Type-check**

```bash
npx vue-tsc --noEmit
```
Expected: 0 errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add GEDCOM import types"
```

---

## Task 3: useGedcomImport composable + tests

**Files:**
- Create: `src/composables/useGedcomImport.ts`
- Create: `tests/unit/composables/useGedcomImport.test.ts`

**Step 1: Write the failing tests**

Create `tests/unit/composables/useGedcomImport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock (needed for composable import) ─────────────────────────────
const { mockChain, mockFrom } = vi.hoisted(() => {
  const mockChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'new-uuid' }, error: null }),
  }
  const mockFrom = vi.fn(() => mockChain)
  return { mockChain, mockFrom }
})

vi.mock('@/services/supabase', () => ({
  supabase: { from: mockFrom },
}))

import {
  parseName,
  parseGedcomDate,
  gedcomRecordsToPeople,
  gedcomRecordsToFamilies,
  detectConflicts,
} from '@/composables/useGedcomImport'
import type { PersonSummary } from '@/types'

// ─── parseName ────────────────────────────────────────────────────────────────

describe('parseName', () => {
  it('splits standard "First /Last/" format', () => {
    expect(parseName('John /Smith/')).toEqual({ firstName: 'John', lastName: 'Smith' })
  })

  it('handles "First Middle /Last/"', () => {
    expect(parseName('John William /Smith/')).toEqual({ firstName: 'John William', lastName: 'Smith' })
  })

  it('handles name with only surname "/Unknown/"', () => {
    expect(parseName('/Unknown/')).toEqual({ firstName: '', lastName: 'Unknown' })
  })

  it('handles no-slash format (fallback)', () => {
    expect(parseName('Mary')).toEqual({ firstName: 'Mary', lastName: '' })
  })

  it('handles empty string', () => {
    expect(parseName('')).toEqual({ firstName: '', lastName: '' })
  })
})

// ─── parseGedcomDate ──────────────────────────────────────────────────────────

describe('parseGedcomDate', () => {
  it('parses full date "15 JAN 1920"', () => {
    expect(parseGedcomDate('15 JAN 1920')).toBe('1920-01-15')
  })

  it('parses single-digit day "5 MAR 1945"', () => {
    expect(parseGedcomDate('5 MAR 1945')).toBe('1945-03-05')
  })

  it('parses month-year "JAN 1920"', () => {
    expect(parseGedcomDate('JAN 1920')).toBe('1920-01-01')
  })

  it('parses year-only "1920"', () => {
    expect(parseGedcomDate('1920')).toBe('1920-01-01')
  })

  it('strips ABT qualifier from year', () => {
    expect(parseGedcomDate('ABT 1920')).toBe('1920-01-01')
  })

  it('strips BEF qualifier from full date', () => {
    expect(parseGedcomDate('BEF 15 JAN 1920')).toBe('1920-01-15')
  })

  it('strips EST qualifier', () => {
    expect(parseGedcomDate('EST 1905')).toBe('1905-01-01')
  })

  it('returns null for empty string', () => {
    expect(parseGedcomDate('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(parseGedcomDate(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(parseGedcomDate(undefined)).toBeNull()
  })
})

// ─── Sample GEDCOM records ────────────────────────────────────────────────────

const SAMPLE_RECORDS = [
  {
    tag: 'INDI', pointer: '@I1@', data: '', tree: [
      { tag: 'NAME', pointer: '', data: 'John /Smith/', tree: [] },
      { tag: 'BIRT', pointer: '', data: '', tree: [
        { tag: 'DATE', pointer: '', data: '15 JAN 1920', tree: [] },
        { tag: 'PLAC', pointer: '', data: 'New York, NY', tree: [] },
      ]},
      { tag: 'DEAT', pointer: '', data: '', tree: [
        { tag: 'DATE', pointer: '', data: '20 DEC 1990', tree: [] },
        { tag: 'PLAC', pointer: '', data: 'Boston, MA', tree: [] },
      ]},
    ],
  },
  {
    tag: 'INDI', pointer: '@I2@', data: '', tree: [
      { tag: 'NAME', pointer: '', data: 'Mary /Jones/', tree: [] },
    ],
  },
  {
    tag: 'INDI', pointer: '@I3@', data: '', tree: [
      { tag: 'NAME', pointer: '', data: 'Billy /Smith/', tree: [] },
      { tag: 'BIRT', pointer: '', data: '', tree: [
        { tag: 'DATE', pointer: '', data: '1950', tree: [] },
      ]},
    ],
  },
  {
    tag: 'FAM', pointer: '@F1@', data: '', tree: [
      { tag: 'HUSB', pointer: '', data: '@I1@', tree: [] },
      { tag: 'WIFE', pointer: '', data: '@I2@', tree: [] },
      { tag: 'CHIL', pointer: '', data: '@I3@', tree: [] },
      { tag: 'MARR', pointer: '', data: '', tree: [
        { tag: 'DATE', pointer: '', data: '10 JUN 1945', tree: [] },
        { tag: 'PLAC', pointer: '', data: 'Boston, MA', tree: [] },
      ]},
    ],
  },
  {
    tag: 'HEAD', pointer: '', data: '', tree: [],  // non-INDI/FAM record, should be ignored
  },
]

// ─── gedcomRecordsToPeople ────────────────────────────────────────────────────

describe('gedcomRecordsToPeople', () => {
  it('maps INDI records and ignores other tags', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    expect(people).toHaveLength(3)
    expect(people.every(p => p.gedcomId.startsWith('@I'))).toBe(true)
  })

  it('maps name, birth, death correctly', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    expect(people[0]).toMatchObject({
      gedcomId: '@I1@',
      firstName: 'John',
      lastName: 'Smith',
      birthDate: '1920-01-15',
      birthPlace: 'New York, NY',
      deathDate: '1990-12-20',
      deathPlace: 'Boston, MA',
    })
  })

  it('handles missing birth/death fields gracefully (null)', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    expect(people[1]).toMatchObject({
      gedcomId: '@I2@',
      firstName: 'Mary',
      lastName: 'Jones',
      birthDate: null,
      birthPlace: null,
      deathDate: null,
    })
  })
})

// ─── gedcomRecordsToFamilies ──────────────────────────────────────────────────

describe('gedcomRecordsToFamilies', () => {
  it('maps FAM records and ignores non-FAM tags', () => {
    const families = gedcomRecordsToFamilies(SAMPLE_RECORDS)
    expect(families).toHaveLength(1)
  })

  it('maps husband, wife, children, and marriage details', () => {
    const families = gedcomRecordsToFamilies(SAMPLE_RECORDS)
    expect(families[0]).toMatchObject({
      gedcomId: '@F1@',
      husbandGedcomId: '@I1@',
      wifeGedcomId: '@I2@',
      childGedcomIds: ['@I3@'],
      marriageDate: '1945-06-10',
      marriagePlace: 'Boston, MA',
    })
  })

  it('handles FAM without MARR (null dates)', () => {
    const noMarrRecord = [{
      tag: 'FAM', pointer: '@F2@', data: '', tree: [
        { tag: 'HUSB', pointer: '', data: '@I1@', tree: [] },
      ],
    }]
    const families = gedcomRecordsToFamilies(noMarrRecord)
    expect(families[0].marriageDate).toBeNull()
    expect(families[0].marriagePlace).toBeNull()
  })
})

// ─── detectConflicts ──────────────────────────────────────────────────────────

describe('detectConflicts', () => {
  const existing: PersonSummary[] = [
    {
      id: 'p1', firstName: 'John', lastName: 'Smith',
      birthSurname: null, nickname: null,
      birthDate: '1920-03-01', deathDate: null, primaryPhotoId: null,
    },
  ]

  it('flags same name + same birth year as conflict', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts, nonConflicts } = detectConflicts(people, existing)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].gedcomPerson.firstName).toBe('John')
    expect(conflicts[0].existingPersonId).toBe('p1')
    expect(nonConflicts).toHaveLength(2)
  })

  it('does not flag when birth years differ', () => {
    const diffYear: PersonSummary[] = [{
      id: 'p2', firstName: 'John', lastName: 'Smith',
      birthSurname: null, nickname: null,
      birthDate: '1925-01-01', deathDate: null, primaryPhotoId: null,
    }]
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts } = detectConflicts(people, diffYear)
    expect(conflicts).toHaveLength(0)
  })

  it('does not flag when last name differs', () => {
    const diffName: PersonSummary[] = [{
      id: 'p3', firstName: 'John', lastName: 'Johnson',
      birthSurname: null, nickname: null,
      birthDate: '1920-01-01', deathDate: null, primaryPhotoId: null,
    }]
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts } = detectConflicts(people, diffName)
    expect(conflicts).toHaveLength(0)
  })

  it('flags same name with both birth dates null as conflict', () => {
    // Two people named "Mary Jones" with no birth date — ambiguous, flag it
    const existingMary: PersonSummary[] = [{
      id: 'p4', firstName: 'Mary', lastName: 'Jones',
      birthSurname: null, nickname: null,
      birthDate: null, deathDate: null, primaryPhotoId: null,
    }]
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts } = detectConflicts(people, existingMary)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].gedcomPerson.firstName).toBe('Mary')
  })

  it('returns all people as nonConflicts when existing is empty', () => {
    const people = gedcomRecordsToPeople(SAMPLE_RECORDS)
    const { conflicts, nonConflicts } = detectConflicts(people, [])
    expect(conflicts).toHaveLength(0)
    expect(nonConflicts).toHaveLength(3)
  })
})
```

**Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- tests/unit/composables/useGedcomImport.test.ts
```
Expected: FAIL — module `@/composables/useGedcomImport` not found.

**Step 3: Create src/composables/useGedcomImport.ts**

```ts
import { ref } from 'vue'
import { parse } from 'parse-gedcom'
import { supabase } from '@/services/supabase'
import type {
  GedcomImportPerson,
  GedcomImportFamily,
  GedcomImportPreview,
  GedcomImportResult,
  GedcomConflict,
  PersonSummary,
} from '@/types'

// ─── Internal GEDCOM record shape ─────────────────────────────────────────────

interface GedcomRecord {
  tag: string
  pointer: string
  data: string
  tree: GedcomRecord[]
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function parseName(raw: string): { firstName: string; lastName: string } {
  // Standard format: "First Middle /Surname/" (trailing slash optional)
  const match = raw.match(/^([^/]*)\s*\/([^/]*)\/?\s*(.*)$/)
  if (match) {
    const before  = match[1].trim()
    const surname = match[2].trim()
    // If nothing before the slash, the first name may be after the closing slash
    return { firstName: before || match[3].trim(), lastName: surname }
  }
  const parts = raw.trim().split(/\s+/)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

export function parseGedcomDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Strip leading qualifiers (ABT, EST, BEF, AFT, CAL)
  const cleaned = raw.replace(/^(ABT|EST|BEF|AFT|CAL)\s+/i, '').trim()

  // "D MON YYYY" or "DD MON YYYY"
  const full = cleaned.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/i)
  if (full) {
    const month = MONTH_MAP[full[2].toUpperCase()] ?? '01'
    return `${full[3]}-${month}-${full[1].padStart(2, '0')}`
  }

  // "MON YYYY"
  const monthYear = cleaned.match(/^([A-Z]{3})\s+(\d{4})$/i)
  if (monthYear) {
    const month = MONTH_MAP[monthYear[1].toUpperCase()] ?? '01'
    return `${monthYear[2]}-${month}-01`
  }

  // "YYYY"
  const year = cleaned.match(/^(\d{4})$/)
  if (year) return `${year[1]}-01-01`

  return null
}

function child(record: GedcomRecord, tag: string): GedcomRecord | undefined {
  return record.tree.find(r => r.tag === tag)
}

function children(record: GedcomRecord, tag: string): GedcomRecord[] {
  return record.tree.filter(r => r.tag === tag)
}

const EMPTY: GedcomRecord = { tag: '', pointer: '', data: '', tree: [] }

export function gedcomRecordsToPeople(records: GedcomRecord[]): GedcomImportPerson[] {
  return records
    .filter(r => r.tag === 'INDI')
    .map(indi => {
      const nameRec = child(indi, 'NAME')
      const birt = child(indi, 'BIRT') ?? EMPTY
      const deat = child(indi, 'DEAT') ?? EMPTY
      const buri = child(indi, 'BURI') ?? EMPTY
      const { firstName, lastName } = parseName(nameRec?.data ?? '')
      return {
        gedcomId:   indi.pointer,
        firstName,
        lastName,
        birthDate:  parseGedcomDate(child(birt, 'DATE')?.data),
        birthPlace: child(birt, 'PLAC')?.data ?? null,
        deathDate:  parseGedcomDate(child(deat, 'DATE')?.data),
        deathPlace: child(deat, 'PLAC')?.data ?? null,
        burialPlace: child(buri, 'PLAC')?.data ?? null,
        notes:      child(indi, 'NOTE')?.data ?? null,
      }
    })
}

export function gedcomRecordsToFamilies(records: GedcomRecord[]): GedcomImportFamily[] {
  return records
    .filter(r => r.tag === 'FAM')
    .map(fam => {
      const marr = child(fam, 'MARR') ?? EMPTY
      return {
        gedcomId:        fam.pointer,
        husbandGedcomId: child(fam, 'HUSB')?.data ?? null,
        wifeGedcomId:    child(fam, 'WIFE')?.data ?? null,
        childGedcomIds:  children(fam, 'CHIL').map(c => c.data),
        marriageDate:    parseGedcomDate(child(marr, 'DATE')?.data),
        marriagePlace:   child(marr, 'PLAC')?.data ?? null,
      }
    })
}

export function detectConflicts(
  people: GedcomImportPerson[],
  existing: PersonSummary[],
): { nonConflicts: GedcomImportPerson[]; conflicts: GedcomConflict[] } {
  const conflicts: GedcomConflict[]     = []
  const nonConflicts: GedcomImportPerson[] = []

  for (const person of people) {
    const birthYear = person.birthDate?.slice(0, 4) ?? null

    const match = existing.find(e => {
      const eBirthYear = e.birthDate?.slice(0, 4) ?? null
      const nameMatch =
        e.firstName.toLowerCase() === person.firstName.toLowerCase() &&
        e.lastName.toLowerCase()  === person.lastName.toLowerCase()
      // Conflict: same name AND same birth year (null === null counts as same)
      return nameMatch && birthYear === eBirthYear
    })

    if (match) {
      conflicts.push({
        gedcomPerson:        person,
        existingPersonId:    match.id,
        existingPersonName:  `${match.firstName} ${match.lastName}`,
      })
    } else {
      nonConflicts.push(person)
    }
  }

  return { nonConflicts, conflicts }
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useGedcomImport() {
  const preview   = ref<GedcomImportPreview | null>(null)
  const isLoading = ref(false)
  const progress  = ref(0)
  const total     = ref(0)
  const error     = ref<string | null>(null)

  async function parseFile(file: File, existing: PersonSummary[]): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const text    = await file.text()
      const records = parse(text) as GedcomRecord[]
      const people  = gedcomRecordsToPeople(records)
      const families = gedcomRecordsToFamilies(records)
      const { nonConflicts, conflicts } = detectConflicts(people, existing)
      preview.value = { people: nonConflicts, families, conflicts }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to parse GEDCOM file'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function runImport(currentUserId: string): Promise<GedcomImportResult> {
    if (!preview.value) throw new Error('No preview to import')
    isLoading.value = true
    progress.value  = 0
    total.value     = preview.value.people.length
    error.value     = null

    // Capture snapshot before clearing preview
    const { people, families, conflicts } = preview.value
    const gedcomIdToDbId = new Map<string, string>()

    try {
      // 1. Insert people — one at a time to capture returned IDs
      for (const person of people) {
        const { data, error: dbError } = await supabase
          .from('people')
          .insert({
            first_name:   person.firstName,
            last_name:    person.lastName,
            birth_date:   person.birthDate,
            birth_place:  person.birthPlace,
            death_date:   person.deathDate,
            death_place:  person.deathPlace,
            burial_place: person.burialPlace,
            notes:        person.notes,
            created_by:   currentUserId,
            name_variants: [],
          })
          .select('id')
          .single()
        if (dbError) throw dbError
        gedcomIdToDbId.set(person.gedcomId, data.id)
        progress.value++
      }

      // 2. Insert marriages and parent-child relationships
      for (const family of families) {
        const husbDbId = family.husbandGedcomId ? gedcomIdToDbId.get(family.husbandGedcomId) : null
        const wifeDbId = family.wifeGedcomId    ? gedcomIdToDbId.get(family.wifeGedcomId)    : null

        if (husbDbId && wifeDbId) {
          await supabase.from('marriages').insert({
            person_a_id:    husbDbId,
            person_b_id:    wifeDbId,
            marriage_date:  family.marriageDate,
            marriage_place: family.marriagePlace,
          })
        }

        // Parent IDs for children (only include parents who were imported in this batch)
        const parentIds = [husbDbId, wifeDbId].filter((id): id is string => id !== null)
        for (const childGedcomId of family.childGedcomIds) {
          const childDbId = gedcomIdToDbId.get(childGedcomId)
          if (!childDbId) continue
          for (const parentId of parentIds) {
            await supabase.from('parent_child').insert({
              parent_id:         parentId,
              child_id:          childDbId,
              relationship_type: 'biological',
              confirmed:         true,
            })
          }
        }
      }

      preview.value = null
      return { created: people.length, skipped: conflicts.length, conflicts }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Import failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function reset(): void {
    preview.value  = null
    error.value    = null
    progress.value = 0
    total.value    = 0
  }

  return { preview, isLoading, progress, total, error, parseFile, runImport, reset }
}
```

**Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- tests/unit/composables/useGedcomImport.test.ts
```
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/composables/useGedcomImport.ts tests/unit/composables/useGedcomImport.test.ts
git commit -m "feat: add useGedcomImport composable with GEDCOM parsing, mapping, and conflict detection"
```

---

## Task 4: GedcomImportView

**Files:**
- Create: `src/views/GedcomImportView.vue`

**Step 1: Create the view**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGedcomImport } from '@/composables/useGedcomImport'
import { usePeopleStore } from '@/stores/people'
import { useAuthStore } from '@/stores/auth'
import type { GedcomImportResult } from '@/types'

const auth   = useAuthStore()
const people = usePeopleStore()
const gedcom = useGedcomImport()

type Step = 'upload' | 'preview' | 'importing' | 'done'

const step      = ref<Step>('upload')
const result    = ref<GedcomImportResult | null>(null)
const file      = ref<File | null>(null)
const fileError = ref<string | null>(null)

function onFileChange(e: Event) {
  const input    = e.target as HTMLInputElement
  const selected = input.files?.[0]
  fileError.value = null
  if (!selected) { file.value = null; return }
  if (!selected.name.toLowerCase().endsWith('.ged')) {
    fileError.value = 'Only .ged files are supported'
    file.value = null
    return
  }
  file.value = selected
}

async function onParse() {
  if (!file.value) return
  await people.fetchPeople()
  const summaries = people.list.map(p => ({
    id: p.id, firstName: p.firstName, lastName: p.lastName,
    birthSurname: p.birthSurname, nickname: p.nickname,
    birthDate: p.birthDate, deathDate: p.deathDate, primaryPhotoId: p.primaryPhotoId,
  }))
  await gedcom.parseFile(file.value, summaries)
  step.value = 'preview'
}

async function onImport() {
  step.value = 'importing'
  result.value = await gedcom.runImport(auth.profile!.id)
  step.value = 'done'
}

function onReset() {
  gedcom.reset()
  step.value  = 'upload'
  result.value = null
  file.value   = null
  fileError.value = null
}

const samplePeople = computed(() => gedcom.preview.value?.people.slice(0, 20) ?? [])
const importCount  = computed(() => gedcom.preview.value?.people.length ?? 0)
const progressPct  = computed(() =>
  gedcom.total.value > 0 ? (gedcom.progress.value / gedcom.total.value) * 100 : 0
)
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10">
    <h1 class="font-display text-3xl text-walnut mb-8">Import GEDCOM</h1>

    <!-- Step 1: Upload -->
    <div v-if="step === 'upload'" class="card p-8 space-y-6">
      <p class="text-walnut-muted">
        Upload a <code class="bg-cream px-1 rounded">.ged</code> file exported from genealogy software
        (Family Tree Maker, Ancestry, MacFamilyTree, etc.).
      </p>

      <div>
        <label class="block text-sm font-medium text-walnut mb-2">GEDCOM File</label>
        <input
          type="file"
          accept=".ged"
          class="block w-full text-sm text-walnut-muted
                 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0
                 file:bg-cream file:text-walnut hover:file:bg-parchment cursor-pointer"
          @change="onFileChange"
        />
        <p v-if="fileError" class="mt-1 text-sm text-red-600">{{ fileError }}</p>
      </div>

      <p v-if="gedcom.error.value" class="text-sm text-red-600">{{ gedcom.error.value }}</p>

      <div class="flex gap-3">
        <button
          class="btn-primary"
          :disabled="!file || gedcom.isLoading.value"
          @click="onParse"
        >
          {{ gedcom.isLoading.value ? 'Parsing…' : 'Parse File' }}
        </button>
        <RouterLink to="/admin" class="btn-secondary">Cancel</RouterLink>
      </div>
    </div>

    <!-- Step 2: Preview -->
    <div v-else-if="step === 'preview' && gedcom.preview.value" class="space-y-6">
      <!-- Summary cards -->
      <div class="card p-6 grid grid-cols-3 gap-4 text-center">
        <div>
          <p class="text-3xl font-display text-walnut">{{ gedcom.preview.value.people.length }}</p>
          <p class="text-sm text-walnut-muted">People to import</p>
        </div>
        <div>
          <p class="text-3xl font-display text-walnut">{{ gedcom.preview.value.families.length }}</p>
          <p class="text-sm text-walnut-muted">Families</p>
        </div>
        <div>
          <p class="text-3xl font-display text-walnut">{{ gedcom.preview.value.conflicts.length }}</p>
          <p class="text-sm text-walnut-muted">Conflicts (skipped)</p>
        </div>
      </div>

      <!-- Sample table -->
      <div class="card overflow-hidden">
        <div class="px-4 py-3 border-b border-cream-dark">
          <h2 class="font-medium text-walnut">Sample records (first 20)</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-cream text-walnut-muted">
              <tr>
                <th class="px-4 py-2 text-left font-medium">Name</th>
                <th class="px-4 py-2 text-left font-medium">Birth year</th>
                <th class="px-4 py-2 text-left font-medium">Death year</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="person in samplePeople"
                :key="person.gedcomId"
                class="border-t border-cream-dark"
              >
                <td class="px-4 py-2 text-walnut">{{ person.firstName }} {{ person.lastName }}</td>
                <td class="px-4 py-2 text-walnut-muted">{{ person.birthDate?.slice(0, 4) ?? '—' }}</td>
                <td class="px-4 py-2 text-walnut-muted">{{ person.deathDate?.slice(0, 4) ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Conflicts -->
      <div v-if="gedcom.preview.value.conflicts.length > 0" class="card p-6">
        <h2 class="font-medium text-walnut mb-3">Conflicts — these will be skipped</h2>
        <ul class="space-y-1 text-sm text-walnut-muted">
          <li
            v-for="c in gedcom.preview.value.conflicts"
            :key="c.gedcomPerson.gedcomId"
          >
            <span class="text-walnut font-medium">
              {{ c.gedcomPerson.firstName }} {{ c.gedcomPerson.lastName }}
            </span>
            — already exists as
            <RouterLink
              :to="`/people/${c.existingPersonId}`"
              class="underline hover:text-walnut"
            >{{ c.existingPersonName }}</RouterLink>
          </li>
        </ul>
      </div>

      <div class="flex gap-3">
        <button class="btn-primary" @click="onImport">
          Import {{ importCount }} {{ importCount === 1 ? 'person' : 'people' }}
        </button>
        <button class="btn-secondary" @click="step = 'upload'; gedcom.reset()">Back</button>
      </div>
    </div>

    <!-- Step 3: Importing -->
    <div v-else-if="step === 'importing'" class="card p-8 space-y-4">
      <p class="font-medium text-walnut">Importing…</p>
      <div class="w-full bg-cream-dark rounded-full h-2 overflow-hidden">
        <div
          class="bg-walnut h-2 rounded-full transition-all duration-300"
          :style="{ width: `${progressPct}%` }"
        />
      </div>
      <p class="text-sm text-walnut-muted">
        {{ gedcom.progress.value }} / {{ gedcom.total.value }} people
      </p>
    </div>

    <!-- Step 4: Done -->
    <div v-else-if="step === 'done' && result" class="card p-8 space-y-4">
      <p class="text-xl font-display text-walnut">Import complete</p>
      <p class="text-walnut-muted">
        {{ result.created }} {{ result.created === 1 ? 'person' : 'people' }} added,
        {{ result.skipped }} skipped (conflicts)
      </p>

      <div v-if="result.conflicts.length > 0" class="pt-2">
        <p class="text-sm font-medium text-walnut mb-1">Skipped conflicts:</p>
        <ul class="text-sm text-walnut-muted space-y-1">
          <li v-for="c in result.conflicts" :key="c.gedcomPerson.gedcomId">
            {{ c.gedcomPerson.firstName }} {{ c.gedcomPerson.lastName }} →
            <RouterLink :to="`/people/${c.existingPersonId}`" class="underline hover:text-walnut">
              {{ c.existingPersonName }}
            </RouterLink>
          </li>
        </ul>
      </div>

      <div class="flex gap-3 pt-2">
        <RouterLink to="/people" class="btn-primary">Browse People</RouterLink>
        <button class="btn-secondary" @click="onReset">Import Another File</button>
      </div>
    </div>
  </div>
</template>
```

**Step 2: Type-check**

```bash
npx vue-tsc --noEmit
```
Expected: 0 errors.

**Step 3: Commit**

```bash
git add src/views/GedcomImportView.vue
git commit -m "feat: add GedcomImportView with 4-step upload/preview/importing/done flow"
```

---

## Task 5: Router route + navigation links

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/App.vue`
- Modify: `src/views/admin/AdminView.vue`

**Step 1: Add route**

In `src/router/index.ts`, after the `document-review` route (line 79), add:

```ts
    {
      path: '/import/gedcom',
      name: 'gedcom-import',
      component: () => import('@/views/GedcomImportView.vue'),
      meta: { requiresEditor: true },
    },
```

**Step 2: Add nav link in App.vue for editors**

In `src/App.vue`, after the "Upload Document" RouterLink (line 28), add:

```vue
          <RouterLink v-if="auth.isEditor" to="/import/gedcom" class="text-sm text-walnut-muted hover:text-walnut transition-colors">Import GEDCOM</RouterLink>
```

**Step 3: Add discovery card in AdminView.vue for admins**

Replace the `<div class="grid ...">` content in `src/views/admin/AdminView.vue`:

```vue
    <div class="grid gap-4 sm:grid-cols-2">
      <RouterLink to="/admin/approvals" class="card p-6 hover:border-walnut-muted transition-colors block">
        <h2 class="font-display text-lg text-walnut mb-1">Pending Approvals</h2>
        <p class="text-sm text-walnut-muted">Review and approve new family member registrations</p>
      </RouterLink>
      <RouterLink to="/import/gedcom" class="card p-6 hover:border-walnut-muted transition-colors block">
        <h2 class="font-display text-lg text-walnut mb-1">Import GEDCOM</h2>
        <p class="text-sm text-walnut-muted">Bulk-import people and relationships from a .ged file</p>
      </RouterLink>
    </div>
```

**Step 4: Type-check**

```bash
npx vue-tsc --noEmit
```
Expected: 0 errors.

**Step 5: Commit**

```bash
git add src/router/index.ts src/App.vue src/views/admin/AdminView.vue
git commit -m "feat: add GEDCOM import route and navigation links for editors and admins"
```

---

## Task 6: Full verification

**Step 1: Run full test suite**

```bash
npm run test:run
```
Expected: All tests pass (82+ including new GEDCOM tests).

**Step 2: Type-check**

```bash
npx vue-tsc --noEmit
```
Expected: 0 errors.

**Step 3: Build**

```bash
npm run build
```
Expected: Build succeeds with no errors or warnings.

**Step 4: Manual smoke test (dev server)**

```bash
npm run dev
```

1. Log in as editor
2. Click "Import GEDCOM" in nav
3. Upload a `.ged` file (or create a minimal test file — see below)
4. Verify preview shows people count + sample table
5. Click Import and verify progress bar
6. Verify done screen shows counts

**Minimal test GEDCOM file** — save as `test.ged`:

```
0 HEAD
1 GEDC
2 VERS 5.5.1
0 @I1@ INDI
1 NAME Test /Person/
1 BIRT
2 DATE 1 JAN 1900
2 PLAC Test City
0 @I2@ INDI
1 NAME Another /Person/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1 JUN 1925
0 TRLR
```

**Step 5: Commit any fixups**

```bash
git add -p
git commit -m "fix: <description if needed>"
```
