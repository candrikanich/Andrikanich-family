# Phase 2 — Person Records Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build people CRUD, profile pages, relationship linking, search, and onboarding name-match — all form-based, no AI yet.

**Architecture:** `usePeopleStore` owns the paginated list and core CRUD. Sub-entity data (residences, education, occupations, military) is fetched per-person via focused composables. Components are layered on top: `PersonCard` for list items, `PersonForm` for create/edit, `RelationshipPanel` for linking.

**Tech Stack:** Vue 3 Composition API, Pinia, Supabase JS client (typed), Vitest for unit tests, TailwindCSS v4 heritage theme.

---

## Reference

- Design doc: `docs/plans/2026-02-26-phase-2-design.md`
- App types: `src/types/index.ts`
- DB types: `src/types/database.ts`
- Supabase client: `src/services/supabase.ts` → `supabase` (typed `createClient<Database>`)
- Auth store pattern: `src/stores/auth.ts` (follow this — snake_case in, camelCase out via `mapX` function)
- Existing test pattern: `tests/unit/stores/auth.test.ts`
- Theme classes: `btn-primary`, `card`, `font-display`, `text-walnut`, `text-walnut-muted`, `bg-cream`
- Run tests: `npm run test:run`
- Type check: `npx vue-tsc --noEmit`

---

## Task 1: Types + People Store

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/stores/people.ts`
- Create: `tests/unit/stores/people.test.ts`

### Step 1: Add input types to `src/types/index.ts`

Append after the `NameMatchCandidate` interface at the bottom:

```ts
// ─── People Input ─────────────────────────────────────────────────────────────

export interface PersonInput {
  firstName: string
  lastName: string
  birthSurname?: string | null
  nickname?: string | null
  nameVariants?: string[]
  suffix?: string | null
  birthDate?: string | null
  birthPlace?: string | null
  deathDate?: string | null
  deathPlace?: string | null
  burialPlace?: string | null
  notes?: string | null
  biography?: string | null
}

export interface PeopleSearchParams {
  query?: string
  birthYearMin?: number
  birthYearMax?: number
  location?: string
}
```

### Step 2: Write the failing tests

Create `tests/unit/stores/people.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockChain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  single: vi.fn(),
}
const mockFrom = vi.fn(() => mockChain)

vi.mock('@/services/supabase', () => ({ supabase: { from: mockFrom } }))

import { usePeopleStore } from '@/stores/people'
import type { Person } from '@/types'

const PERSON_ROW = {
  id: 'uuid-1',
  first_name: 'John',
  last_name: 'Andrikanich',
  birth_surname: null,
  nickname: 'Johnny',
  name_variants: [],
  suffix: null,
  birth_date: '1920-05-10',
  birth_place: 'Cleveland, OH',
  death_date: null,
  death_place: null,
  burial_place: null,
  notes: null,
  biography: null,
  primary_photo_id: null,
  user_id: null,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const PERSON: Person = {
  id: 'uuid-1',
  firstName: 'John',
  lastName: 'Andrikanich',
  birthSurname: null,
  nickname: 'Johnny',
  nameVariants: [],
  suffix: null,
  birthDate: '1920-05-10',
  birthPlace: 'Cleveland, OH',
  deathDate: null,
  deathPlace: null,
  burialPlace: null,
  notes: null,
  biography: null,
  primaryPhotoId: null,
  userId: null,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('usePeopleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Reset chain methods to return `this` by default
    Object.keys(mockChain).forEach(k => {
      if (k !== 'single') {
        ;(mockChain as Record<string, ReturnType<typeof vi.fn>>)[k].mockReturnThis()
      }
    })
  })

  it('initialises with empty list', () => {
    const store = usePeopleStore()
    expect(store.list).toEqual([])
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchPeople populates list and maps snake_case to camelCase', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [PERSON_ROW], error: null })
    const store = usePeopleStore()
    await store.fetchPeople()
    expect(store.list).toEqual([PERSON])
    expect(store.isLoading).toBe(false)
  })

  it('fetchPeople sets error on failure', async () => {
    mockChain.order.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const store = usePeopleStore()
    await expect(store.fetchPeople()).rejects.toThrow('DB error')
    expect(store.error).toBe('DB error')
  })

  it('createPerson inserts and returns mapped person', async () => {
    mockChain.single.mockResolvedValueOnce({ data: PERSON_ROW, error: null })
    const store = usePeopleStore()
    const result = await store.createPerson({ firstName: 'John', lastName: 'Andrikanich' })
    expect(result).toEqual(PERSON)
    expect(store.list).toContainEqual(PERSON)
  })

  it('updatePerson updates list in place', async () => {
    const updated = { ...PERSON_ROW, nickname: 'Jack' }
    mockChain.single.mockResolvedValueOnce({ data: updated, error: null })
    const store = usePeopleStore()
    store.list = [PERSON]
    const result = await store.updatePerson('uuid-1', { nickname: 'Jack' })
    expect(result.nickname).toBe('Jack')
    expect(store.list[0].nickname).toBe('Jack')
  })

  it('deletePerson removes from list', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null })
    const store = usePeopleStore()
    store.list = [PERSON]
    await store.deletePerson('uuid-1')
    expect(store.list).toEqual([])
  })
})
```

### Step 3: Run tests to verify they fail

```bash
npm run test:run -- tests/unit/stores/people.test.ts
```

Expected: all tests fail with "Cannot find module '@/stores/people'"

### Step 4: Implement `src/stores/people.ts`

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Person, PersonInput, PeopleSearchParams } from '@/types'
import type { Database } from '@/types/database'

type PersonRow = Database['public']['Tables']['people']['Row']

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthSurname: row.birth_surname,
    nickname: row.nickname,
    nameVariants: row.name_variants,
    suffix: row.suffix,
    birthDate: row.birth_date,
    birthPlace: row.birth_place,
    deathDate: row.death_date,
    deathPlace: row.death_place,
    burialPlace: row.burial_place,
    notes: row.notes,
    biography: row.biography,
    primaryPhotoId: row.primary_photo_id,
    userId: row.user_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const usePeopleStore = defineStore('people', () => {
  const list = ref<Person[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPeople(params?: PeopleSearchParams) {
    isLoading.value = true
    error.value = null
    try {
      let query = supabase.from('people').select('*').order('last_name', { ascending: true })

      if (params?.query) {
        const q = `%${params.query}%`
        query = query.or(`first_name.ilike.${q},last_name.ilike.${q},birth_surname.ilike.${q},nickname.ilike.${q}`)
      }
      if (params?.birthYearMin) {
        query = query.gte('birth_date', `${params.birthYearMin}-01-01`)
      }
      if (params?.birthYearMax) {
        query = query.lte('birth_date', `${params.birthYearMax}-12-31`)
      }
      if (params?.location) {
        const loc = `%${params.location}%`
        query = query.or(`birth_place.ilike.${loc},death_place.ilike.${loc}`)
      }

      const { data, error: dbError } = await query
      if (dbError) throw dbError
      list.value = (data ?? []).map(mapPerson)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createPerson(input: PersonInput): Promise<Person> {
    const { data, error: dbError } = await supabase
      .from('people')
      .insert({
        first_name: input.firstName,
        last_name: input.lastName,
        birth_surname: input.birthSurname ?? null,
        nickname: input.nickname ?? null,
        name_variants: input.nameVariants ?? [],
        suffix: input.suffix ?? null,
        birth_date: input.birthDate ?? null,
        birth_place: input.birthPlace ?? null,
        death_date: input.deathDate ?? null,
        death_place: input.deathPlace ?? null,
        burial_place: input.burialPlace ?? null,
        notes: input.notes ?? null,
        biography: input.biography ?? null,
      })
      .select()
      .single()

    if (dbError) throw dbError
    const person = mapPerson(data)
    list.value = [...list.value, person]
    return person
  }

  async function updatePerson(id: string, input: Partial<PersonInput>): Promise<Person> {
    const patch: Record<string, unknown> = {}
    if (input.firstName !== undefined)    patch.first_name    = input.firstName
    if (input.lastName !== undefined)     patch.last_name     = input.lastName
    if (input.birthSurname !== undefined) patch.birth_surname = input.birthSurname
    if (input.nickname !== undefined)     patch.nickname      = input.nickname
    if (input.nameVariants !== undefined) patch.name_variants = input.nameVariants
    if (input.suffix !== undefined)       patch.suffix        = input.suffix
    if (input.birthDate !== undefined)    patch.birth_date    = input.birthDate
    if (input.birthPlace !== undefined)   patch.birth_place   = input.birthPlace
    if (input.deathDate !== undefined)    patch.death_date    = input.deathDate
    if (input.deathPlace !== undefined)   patch.death_place   = input.deathPlace
    if (input.burialPlace !== undefined)  patch.burial_place  = input.burialPlace
    if (input.notes !== undefined)        patch.notes         = input.notes
    if (input.biography !== undefined)    patch.biography     = input.biography

    const { data, error: dbError } = await supabase
      .from('people')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (dbError) throw dbError
    const person = mapPerson(data)
    list.value = list.value.map(p => p.id === id ? person : p)
    return person
  }

  async function deletePerson(id: string): Promise<void> {
    const { error: dbError } = await supabase.from('people').delete().eq('id', id)
    if (dbError) throw dbError
    list.value = list.value.filter(p => p.id !== id)
  }

  return { list, isLoading, error, fetchPeople, createPerson, updatePerson, deletePerson }
})
```

### Step 5: Run tests to verify they pass

```bash
npm run test:run -- tests/unit/stores/people.test.ts
```

Expected: all 6 tests pass

### Step 6: Type check

```bash
npx vue-tsc --noEmit
```

Expected: 0 errors

### Step 7: Commit

```bash
git add src/types/index.ts src/stores/people.ts tests/unit/stores/people.test.ts
git commit -m "feat: add people store with CRUD and search"
```

---

## Task 2: usePersonDetail Composable

**Files:**
- Create: `src/composables/usePersonDetail.ts`
- Create: `tests/unit/composables/usePersonDetail.test.ts`

### Step 1: Write the failing test

Create `tests/unit/composables/usePersonDetail.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockOrder = vi.fn()
const mockEq = vi.fn().mockReturnThis()
const mockOr = vi.fn()
const mockSelect = vi.fn().mockReturnThis()

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: mockSelect,
      eq: mockEq,
      or: table === 'marriages' ? mockOr : mockEq,
      order: mockOrder,
      single: mockSingle,
    })),
  },
}))

import { usePersonDetail } from '@/composables/usePersonDetail'

const PERSON_ROW = {
  id: 'p1', first_name: 'John', last_name: 'Doe', birth_surname: null,
  nickname: null, name_variants: [], suffix: null, birth_date: '1920-01-01',
  birth_place: 'Ohio', death_date: null, death_place: null, burial_place: null,
  notes: null, biography: null, primary_photo_id: null, user_id: null,
  created_by: null, created_at: '', updated_at: '',
}

describe('usePersonDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load fetches person and all sub-entities in parallel', async () => {
    mockSingle.mockResolvedValueOnce({ data: PERSON_ROW, error: null })
    mockOrder
      .mockResolvedValueOnce({ data: [], error: null }) // residences
      .mockResolvedValueOnce({ data: [], error: null }) // education
      .mockResolvedValueOnce({ data: [], error: null }) // occupations
      .mockResolvedValueOnce({ data: [], error: null }) // military_service
      .mockResolvedValueOnce({ data: [], error: null }) // parent_child (parents)
      .mockResolvedValueOnce({ data: [], error: null }) // parent_child (children)
    mockOr.mockResolvedValueOnce({ data: [], error: null }) // marriages

    const detail = usePersonDetail('p1')
    await detail.load()

    expect(detail.person.value?.firstName).toBe('John')
    expect(detail.residences.value).toEqual([])
    expect(detail.isLoading.value).toBe(false)
    expect(detail.error.value).toBeNull()
  })

  it('load sets error when person fetch fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    mockOrder.mockResolvedValue({ data: [], error: null })
    mockOr.mockResolvedValue({ data: [], error: null })

    const detail = usePersonDetail('bad-id')
    await expect(detail.load()).rejects.toThrow('not found')
    expect(detail.error.value).toBe('not found')
  })
})
```

### Step 2: Run to verify it fails

```bash
npm run test:run -- tests/unit/composables/usePersonDetail.test.ts
```

Expected: FAIL — "Cannot find module '@/composables/usePersonDetail'"

### Step 3: Implement `src/composables/usePersonDetail.ts`

```ts
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Person, Residence, Education, Occupation, MilitaryService, ParentChild, Marriage, PersonSummary } from '@/types'
import type { Database } from '@/types/database'

type PersonRow       = Database['public']['Tables']['people']['Row']
type ResidenceRow    = Database['public']['Tables']['residences']['Row']
type EducationRow    = Database['public']['Tables']['education']['Row']
type OccupationRow   = Database['public']['Tables']['occupations']['Row']
type MilitaryRow     = Database['public']['Tables']['military_service']['Row']

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id, firstName: row.first_name, lastName: row.last_name,
    birthSurname: row.birth_surname, nickname: row.nickname, nameVariants: row.name_variants,
    suffix: row.suffix, birthDate: row.birth_date, birthPlace: row.birth_place,
    deathDate: row.death_date, deathPlace: row.death_place, burialPlace: row.burial_place,
    notes: row.notes, biography: row.biography, primaryPhotoId: row.primary_photo_id,
    userId: row.user_id, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function mapResidence(row: ResidenceRow): Residence {
  return {
    id: row.id, personId: row.person_id, location: row.location,
    fromDate: row.from_date, toDate: row.to_date, isCurrent: row.is_current, sortOrder: row.sort_order,
  }
}

function mapEducation(row: EducationRow): Education {
  return {
    id: row.id, personId: row.person_id, institution: row.institution,
    institutionType: row.institution_type, location: row.location,
    startYear: row.start_year, endYear: row.end_year, graduated: row.graduated, notes: row.notes,
  }
}

function mapOccupation(row: OccupationRow): Occupation {
  return {
    id: row.id, personId: row.person_id, employer: row.employer, title: row.title,
    fromDate: row.from_date, toDate: row.to_date, isCurrent: row.is_current,
  }
}

function mapMilitary(row: MilitaryRow): MilitaryService {
  return {
    id: row.id, personId: row.person_id, branch: row.branch, rank: row.rank,
    fromDate: row.from_date, toDate: row.to_date, notes: row.notes,
  }
}

function mapPersonSummary(row: PersonRow): PersonSummary {
  return {
    id: row.id, firstName: row.first_name, lastName: row.last_name,
    birthSurname: row.birth_surname, nickname: row.nickname,
    birthDate: row.birth_date, deathDate: row.death_date, primaryPhotoId: row.primary_photo_id,
  }
}

export interface RelatedParent { person: PersonSummary; relationship: ParentChild }
export interface RelatedChild  { person: PersonSummary; relationship: ParentChild }
export interface RelatedSpouse { person: PersonSummary; marriage: Marriage }

export function usePersonDetail(personId: string) {
  const person         = ref<Person | null>(null)
  const residences     = ref<Residence[]>([])
  const education      = ref<Education[]>([])
  const occupations    = ref<Occupation[]>([])
  const militaryService = ref<MilitaryService[]>([])
  const parents        = ref<RelatedParent[]>([])
  const children       = ref<RelatedChild[]>([])
  const spouses        = ref<RelatedSpouse[]>([])
  const isLoading      = ref(false)
  const error          = ref<string | null>(null)

  async function load() {
    isLoading.value = true
    error.value = null
    try {
      const [
        personRes, residencesRes, educationRes, occupationsRes, militaryRes,
        parentsRes, childrenRes, marriagesRes,
      ] = await Promise.all([
        supabase.from('people').select('*').eq('id', personId).single(),
        supabase.from('residences').select('*').eq('person_id', personId).order('sort_order', { ascending: true }),
        supabase.from('education').select('*').eq('person_id', personId).order('start_year', { ascending: true }),
        supabase.from('occupations').select('*').eq('person_id', personId).order('from_date', { ascending: true }),
        supabase.from('military_service').select('*').eq('person_id', personId).order('from_date', { ascending: true }),
        supabase.from('parent_child').select('*, parent:parent_id(*)').eq('child_id', personId).order('created_at', { ascending: true }),
        supabase.from('parent_child').select('*, child:child_id(*)').eq('parent_id', personId).order('created_at', { ascending: true }),
        supabase.from('marriages').select('*, person_a:person_a_id(*), person_b:person_b_id(*)').or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`),
      ])

      if (personRes.error) throw personRes.error

      person.value        = mapPerson(personRes.data)
      residences.value    = (residencesRes.data ?? []).map(mapResidence)
      education.value     = (educationRes.data ?? []).map(mapEducation)
      occupations.value   = (occupationsRes.data ?? []).map(mapOccupation)
      militaryService.value = (militaryRes.data ?? []).map(mapMilitary)

      parents.value = (parentsRes.data ?? []).map((row: Record<string, unknown>) => ({
        person: mapPersonSummary(row.parent as PersonRow),
        relationship: {
          id: row.id as string, parentId: row.parent_id as string, childId: row.child_id as string,
          relationshipType: row.relationship_type as ParentChild['relationshipType'],
          confirmed: row.confirmed as boolean, createdAt: row.created_at as string,
        },
      }))

      children.value = (childrenRes.data ?? []).map((row: Record<string, unknown>) => ({
        person: mapPersonSummary(row.child as PersonRow),
        relationship: {
          id: row.id as string, parentId: row.parent_id as string, childId: row.child_id as string,
          relationshipType: row.relationship_type as ParentChild['relationshipType'],
          confirmed: row.confirmed as boolean, createdAt: row.created_at as string,
        },
      }))

      spouses.value = (marriagesRes.data ?? []).map((row: Record<string, unknown>) => {
        const spouseRow = (row.person_a_id as string) === personId
          ? row.person_b as PersonRow
          : row.person_a as PersonRow
        return {
          person: mapPersonSummary(spouseRow),
          marriage: {
            id: row.id as string,
            personAId: row.person_a_id as string, personBId: row.person_b_id as string,
            marriageDate: row.marriage_date as string | null,
            marriagePlace: row.marriage_place as string | null,
            endDate: row.end_date as string | null,
            endReason: row.end_reason as Marriage['endReason'],
            createdAt: row.created_at as string,
          },
        }
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return { person, residences, education, occupations, militaryService, parents, children, spouses, isLoading, error, load }
}
```

### Step 4: Run tests to verify they pass

```bash
npm run test:run -- tests/unit/composables/usePersonDetail.test.ts
```

Expected: 2 tests pass

### Step 5: Type check

```bash
npx vue-tsc --noEmit
```

### Step 6: Commit

```bash
git add src/composables/usePersonDetail.ts tests/unit/composables/usePersonDetail.test.ts
git commit -m "feat: add usePersonDetail composable"
```

---

## Task 3: Sub-entity Composables

**Files:**
- Create: `src/composables/useResidences.ts`
- Create: `src/composables/useEducation.ts`
- Create: `src/composables/useOccupations.ts`
- Create: `src/composables/useMilitaryService.ts`

All four follow the same shape. `useResidences` is shown in full; the other three follow identically with their own table/type/mapper.

### Step 1: Create `src/composables/useResidences.ts`

```ts
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Residence } from '@/types'
import type { Database } from '@/types/database'

type ResidenceRow = Database['public']['Tables']['residences']['Row']

function mapResidence(row: ResidenceRow): Residence {
  return {
    id: row.id, personId: row.person_id, location: row.location,
    fromDate: row.from_date, toDate: row.to_date, isCurrent: row.is_current, sortOrder: row.sort_order,
  }
}

export interface ResidenceInput {
  location: string
  fromDate?: string | null
  toDate?: string | null
  isCurrent?: boolean
  sortOrder?: number
}

export function useResidences(personId: string) {
  const items     = ref<Residence[]>([])
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function fetch() {
    isLoading.value = true
    try {
      const { data, error: err } = await supabase
        .from('residences').select('*').eq('person_id', personId).order('sort_order', { ascending: true })
      if (err) throw err
      items.value = (data ?? []).map(mapResidence)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      isLoading.value = false
    }
  }

  async function add(input: ResidenceInput): Promise<Residence> {
    const maxOrder = items.value.reduce((m, r) => Math.max(m, r.sortOrder), 0)
    const { data, error: err } = await supabase
      .from('residences')
      .insert({
        person_id: personId, location: input.location,
        from_date: input.fromDate ?? null, to_date: input.toDate ?? null,
        is_current: input.isCurrent ?? false,
        sort_order: input.sortOrder ?? maxOrder + 1,
      })
      .select().single()
    if (err) throw err
    const residence = mapResidence(data)
    items.value = [...items.value, residence]
    return residence
  }

  async function update(id: string, input: Partial<ResidenceInput>): Promise<Residence> {
    const patch: Record<string, unknown> = {}
    if (input.location  !== undefined) patch.location   = input.location
    if (input.fromDate  !== undefined) patch.from_date  = input.fromDate
    if (input.toDate    !== undefined) patch.to_date    = input.toDate
    if (input.isCurrent !== undefined) patch.is_current = input.isCurrent
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder

    const { data, error: err } = await supabase
      .from('residences').update(patch).eq('id', id).select().single()
    if (err) throw err
    const residence = mapResidence(data)
    items.value = items.value.map(r => r.id === id ? residence : r)
    return residence
  }

  async function remove(id: string): Promise<void> {
    const { error: err } = await supabase.from('residences').delete().eq('id', id)
    if (err) throw err
    items.value = items.value.filter(r => r.id !== id)
  }

  return { items, isLoading, error, fetch, add, update, remove }
}
```

### Step 2: Create the other three composables

`src/composables/useEducation.ts` — same pattern, table `education`, type `Education`, input:
```ts
export interface EducationInput {
  institution: string
  institutionType: Education['institutionType']
  location?: string | null
  startYear?: number | null
  endYear?: number | null
  graduated?: boolean | null
  notes?: string | null
}
```

`src/composables/useOccupations.ts` — table `occupations`, type `Occupation`, input:
```ts
export interface OccupationInput {
  employer?: string | null
  title?: string | null
  fromDate?: string | null
  toDate?: string | null
  isCurrent?: boolean
}
```

`src/composables/useMilitaryService.ts` — table `military_service`, type `MilitaryService`, input:
```ts
export interface MilitaryServiceInput {
  branch?: string | null
  rank?: string | null
  fromDate?: string | null
  toDate?: string | null
  notes?: string | null
}
```

Each mapper follows the same field-by-field pattern as `mapResidence` above.

### Step 3: Type check

```bash
npx vue-tsc --noEmit
```

### Step 4: Commit

```bash
git add src/composables/
git commit -m "feat: add sub-entity composables (residences, education, occupations, military)"
```

---

## Task 4: PersonCard Component

**Files:**
- Create: `src/components/PersonCard.vue`

This is a presentational component — no unit test needed. It renders a mini card with name, lifespan, location.

### Step 1: Create `src/components/PersonCard.vue`

```vue
<script setup lang="ts">
import type { PersonSummary } from '@/types'

const props = defineProps<{ person: PersonSummary }>()

const lifespan = computed(() => {
  const birth = props.person.birthDate ? new Date(props.person.birthDate).getFullYear() : '?'
  if (!props.person.deathDate) return `b. ${birth}`
  const death = new Date(props.person.deathDate).getFullYear()
  return `${birth} – ${death}`
})
</script>

<script lang="ts">
import { computed } from 'vue'
</script>

<template>
  <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="block group">
    <div class="card p-4 hover:shadow-md transition-shadow cursor-pointer">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-parchment border border-walnut/20 flex items-center justify-center flex-shrink-0">
          <span class="font-display text-walnut text-sm">{{ person.firstName[0] }}{{ person.lastName[0] }}</span>
        </div>
        <div class="min-w-0">
          <p class="font-display text-walnut font-medium truncate group-hover:text-walnut/80">
            {{ person.firstName }}
            <span v-if="person.nickname" class="text-walnut-muted font-normal">"{{ person.nickname }}"</span>
            {{ person.lastName }}
            <span v-if="person.birthSurname" class="text-walnut-muted text-sm font-normal">(née {{ person.birthSurname }})</span>
          </p>
          <p class="text-walnut-muted text-xs">{{ lifespan }}</p>
        </div>
      </div>
    </div>
  </RouterLink>
</template>
```

**Note:** The `<script setup>` block needs `computed` — move it into the `<script setup>` block:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { PersonSummary } from '@/types'

const props = defineProps<{ person: PersonSummary }>()

const lifespan = computed(() => {
  const birth = props.person.birthDate ? new Date(props.person.birthDate).getFullYear() : '?'
  if (!props.person.deathDate) return `b. ${birth}`
  const death = new Date(props.person.deathDate).getFullYear()
  return `${birth} – ${death}`
})
</script>

<template>
  <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="block group">
    <div class="card p-4 hover:shadow-md transition-shadow cursor-pointer">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-parchment border border-walnut/20 flex items-center justify-center flex-shrink-0">
          <span class="font-display text-walnut text-sm">{{ person.firstName[0] }}{{ person.lastName[0] }}</span>
        </div>
        <div class="min-w-0">
          <p class="font-display text-walnut font-medium truncate group-hover:text-walnut/80">
            {{ person.firstName }}
            <span v-if="person.nickname" class="text-walnut-muted font-normal">"{{ person.nickname }}"</span>
            {{ person.lastName }}
            <span v-if="person.birthSurname" class="text-walnut-muted text-sm font-normal">(née {{ person.birthSurname }})</span>
          </p>
          <p class="text-walnut-muted text-xs">{{ lifespan }}</p>
        </div>
      </div>
    </div>
  </RouterLink>
</template>
```

### Step 2: Type check + commit

```bash
npx vue-tsc --noEmit
git add src/components/PersonCard.vue
git commit -m "feat: add PersonCard component"
```

---

## Task 5: PersonForm Component

**Files:**
- Create: `src/components/PersonForm.vue`

Modal for create and edit. Shows all core `people` fields. Props: `isOpen`, `person` (optional, for edit pre-fill). Emits: `save(input: PersonInput)`, `close`.

### Step 1: Create `src/components/PersonForm.vue`

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Person, PersonInput } from '@/types'

const props = defineProps<{
  isOpen: boolean
  person?: Person | null
}>()

const emit = defineEmits<{
  save: [input: PersonInput]
  close: []
}>()

const form = ref<PersonInput>({
  firstName: '',
  lastName: '',
  birthSurname: null,
  nickname: null,
  nameVariants: [],
  suffix: null,
  birthDate: null,
  birthPlace: null,
  deathDate: null,
  deathPlace: null,
  burialPlace: null,
  notes: null,
  biography: null,
})

watch(() => props.isOpen, (open) => {
  if (!open) return
  if (props.person) {
    form.value = {
      firstName:   props.person.firstName,
      lastName:    props.person.lastName,
      birthSurname: props.person.birthSurname,
      nickname:    props.person.nickname,
      nameVariants: props.person.nameVariants,
      suffix:      props.person.suffix,
      birthDate:   props.person.birthDate,
      birthPlace:  props.person.birthPlace,
      deathDate:   props.person.deathDate,
      deathPlace:  props.person.deathPlace,
      burialPlace: props.person.burialPlace,
      notes:       props.person.notes,
      biography:   props.person.biography,
    }
  } else {
    form.value = {
      firstName: '', lastName: '', birthSurname: null, nickname: null,
      nameVariants: [], suffix: null, birthDate: null, birthPlace: null,
      deathDate: null, deathPlace: null, burialPlace: null, notes: null, biography: null,
    }
  }
})

function submit() {
  emit('save', { ...form.value })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-walnut/40">
        <div class="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8" @click.stop>
          <div class="flex items-center justify-between mb-6">
            <h2 class="font-display text-2xl text-walnut">
              {{ person ? 'Edit Person' : 'Add Person' }}
            </h2>
            <button @click="emit('close')" class="text-walnut-muted hover:text-walnut transition-colors">✕</button>
          </div>

          <form @submit.prevent="submit" class="space-y-5">
            <!-- Name -->
            <fieldset class="space-y-3">
              <legend class="text-xs uppercase tracking-widest text-walnut-muted font-medium mb-1">Name</legend>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm text-walnut mb-1">First name *</label>
                  <input v-model="form.firstName" required class="input w-full" placeholder="First name" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Last name *</label>
                  <input v-model="form.lastName" required class="input w-full" placeholder="Last name" />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="block text-sm text-walnut mb-1">Birth surname</label>
                  <input v-model="form.birthSurname" class="input w-full" placeholder="Maiden name" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Nickname</label>
                  <input v-model="form.nickname" class="input w-full" placeholder="Known as" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Suffix</label>
                  <input v-model="form.suffix" class="input w-full" placeholder="Jr, Sr, III" />
                </div>
              </div>
            </fieldset>

            <!-- Birth -->
            <fieldset class="space-y-3">
              <legend class="text-xs uppercase tracking-widest text-walnut-muted font-medium mb-1">Birth</legend>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm text-walnut mb-1">Birth date</label>
                  <input v-model="form.birthDate" type="date" class="input w-full" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Birth place</label>
                  <input v-model="form.birthPlace" class="input w-full" placeholder="City, State" />
                </div>
              </div>
            </fieldset>

            <!-- Death -->
            <fieldset class="space-y-3">
              <legend class="text-xs uppercase tracking-widest text-walnut-muted font-medium mb-1">Death</legend>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="block text-sm text-walnut mb-1">Death date</label>
                  <input v-model="form.deathDate" type="date" class="input w-full" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Death place</label>
                  <input v-model="form.deathPlace" class="input w-full" placeholder="City, State" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Burial place</label>
                  <input v-model="form.burialPlace" class="input w-full" placeholder="Cemetery, City" />
                </div>
              </div>
            </fieldset>

            <!-- Notes & Bio -->
            <div>
              <label class="block text-sm text-walnut mb-1">Notes / cross-references</label>
              <textarea v-model="form.notes" rows="2" class="input w-full resize-none"
                placeholder="Uncertainties, see references, etc." />
            </div>
            <div>
              <label class="block text-sm text-walnut mb-1">Biography</label>
              <textarea v-model="form.biography" rows="4" class="input w-full resize-none"
                placeholder="Narrative biography" />
            </div>

            <div class="flex gap-3 pt-2">
              <button type="submit" class="btn-primary flex-1">Save</button>
              <button type="button" @click="emit('close')" class="btn-secondary flex-1">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
```

**Note:** The `input` and `btn-secondary` CSS classes need to be defined in `src/style.css`. Check first — if they aren't there, add:

```css
@layer components {
  .input {
    @apply border border-parchment rounded px-3 py-2 text-sm text-walnut bg-cream
           placeholder:text-walnut/40 focus:outline-none focus:border-walnut/50 transition-colors;
  }
  .btn-secondary {
    @apply px-4 py-2 rounded border border-walnut/30 text-walnut text-sm
           hover:bg-parchment transition-colors;
  }
}
```

### Step 2: Type check + commit

```bash
npx vue-tsc --noEmit
git add src/components/PersonForm.vue src/style.css
git commit -m "feat: add PersonForm component"
```

---

## Task 6: RelationshipPanel Component

**Files:**
- Create: `src/components/RelationshipPanel.vue`

Three-tab panel on the profile page. Tabs: Parents, Children, Spouses. Shows existing, add/remove (editor only).

### Step 1: Create `src/components/RelationshipPanel.vue`

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePeopleStore } from '@/stores/people'
import type { RelatedParent, RelatedChild, RelatedSpouse } from '@/composables/usePersonDetail'
import type { RelationshipType, MarriageEndReason, PersonSummary } from '@/types'

const props = defineProps<{
  personId: string
  parents: RelatedParent[]
  children: RelatedChild[]
  spouses: RelatedSpouse[]
}>()

const emit = defineEmits<{ reload: [] }>()

const auth = useAuthStore()
const people = usePeopleStore()

type Tab = 'parents' | 'children' | 'spouses'
const activeTab = ref<Tab>('parents')
const showPicker = ref(false)
const pickerQuery = ref('')
const pickerResults = computed(() =>
  people.list.filter(p =>
    p.id !== props.personId &&
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(pickerQuery.value.toLowerCase())
  ).slice(0, 8)
)

// Form state for add
const addRelType = ref<RelationshipType>('biological')
const addMarriageDate = ref('')
const addMarriagePlace = ref('')
const addEndReason = ref<MarriageEndReason | ''>('')

async function loadPeopleIfNeeded() {
  if (people.list.length === 0) await people.fetchPeople()
  showPicker.value = true
}

async function addParent(parent: PersonSummary) {
  await supabase.from('parent_child').insert({
    parent_id: parent.id, child_id: props.personId,
    relationship_type: addRelType.value, confirmed: true,
  })
  showPicker.value = false
  emit('reload')
}

async function addChild(child: PersonSummary) {
  await supabase.from('parent_child').insert({
    parent_id: props.personId, child_id: child.id,
    relationship_type: addRelType.value, confirmed: true,
  })
  showPicker.value = false
  emit('reload')
}

async function addSpouse(spouse: PersonSummary) {
  await supabase.from('marriages').insert({
    person_a_id: props.personId, person_b_id: spouse.id,
    marriage_date: addMarriageDate.value || null,
    marriage_place: addMarriagePlace.value || null,
    end_reason: (addEndReason.value as MarriageEndReason) || null,
    end_date: null,
  })
  showPicker.value = false
  emit('reload')
}

async function removeParentChild(id: string) {
  await supabase.from('parent_child').delete().eq('id', id)
  emit('reload')
}

async function removeMarriage(id: string) {
  await supabase.from('marriages').delete().eq('id', id)
  emit('reload')
}

function displayName(p: PersonSummary) {
  const year = p.birthDate ? new Date(p.birthDate).getFullYear() : null
  return year ? `${p.firstName} ${p.lastName} (${year})` : `${p.firstName} ${p.lastName}`
}
</script>

<template>
  <div class="card p-6">
    <h3 class="font-display text-lg text-walnut mb-4">Relationships</h3>

    <!-- Tabs -->
    <div class="flex gap-1 mb-4 border-b border-parchment">
      <button v-for="tab in (['parents', 'children', 'spouses'] as Tab[])" :key="tab"
        @click="activeTab = tab; showPicker = false"
        class="px-4 py-2 text-sm capitalize transition-colors"
        :class="activeTab === tab ? 'border-b-2 border-walnut text-walnut font-medium' : 'text-walnut-muted hover:text-walnut'">
        {{ tab }} ({{ tab === 'parents' ? parents.length : tab === 'children' ? children.length : spouses.length }})
      </button>
    </div>

    <!-- Parents tab -->
    <div v-if="activeTab === 'parents'" class="space-y-2">
      <div v-for="{ person, relationship } in parents" :key="relationship.id"
        class="flex items-center justify-between py-2 border-b border-parchment last:border-0">
        <div>
          <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="text-walnut hover:underline">
            {{ displayName(person) }}
          </RouterLink>
          <span class="ml-2 text-xs text-walnut-muted capitalize">{{ relationship.relationshipType }}</span>
        </div>
        <button v-if="auth.isEditor" @click="removeParentChild(relationship.id)"
          class="text-xs text-walnut-muted hover:text-red-600 transition-colors">Remove</button>
      </div>
      <p v-if="parents.length === 0" class="text-walnut-muted text-sm">No parents linked.</p>
    </div>

    <!-- Children tab -->
    <div v-else-if="activeTab === 'children'" class="space-y-2">
      <div v-for="{ person, relationship } in children" :key="relationship.id"
        class="flex items-center justify-between py-2 border-b border-parchment last:border-0">
        <div>
          <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="text-walnut hover:underline">
            {{ displayName(person) }}
          </RouterLink>
          <span class="ml-2 text-xs text-walnut-muted capitalize">{{ relationship.relationshipType }}</span>
        </div>
        <button v-if="auth.isEditor" @click="removeParentChild(relationship.id)"
          class="text-xs text-walnut-muted hover:text-red-600 transition-colors">Remove</button>
      </div>
      <p v-if="children.length === 0" class="text-walnut-muted text-sm">No children linked.</p>
    </div>

    <!-- Spouses tab -->
    <div v-else class="space-y-2">
      <div v-for="{ person, marriage } in spouses" :key="marriage.id"
        class="flex items-center justify-between py-2 border-b border-parchment last:border-0">
        <div>
          <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="text-walnut hover:underline">
            {{ displayName(person) }}
          </RouterLink>
          <span v-if="marriage.marriageDate" class="ml-2 text-xs text-walnut-muted">
            m. {{ new Date(marriage.marriageDate).getFullYear() }}
          </span>
          <span v-if="marriage.endReason" class="ml-1 text-xs text-walnut-muted capitalize">({{ marriage.endReason }})</span>
        </div>
        <button v-if="auth.isEditor" @click="removeMarriage(marriage.id)"
          class="text-xs text-walnut-muted hover:text-red-600 transition-colors">Remove</button>
      </div>
      <p v-if="spouses.length === 0" class="text-walnut-muted text-sm">No spouses linked.</p>
    </div>

    <!-- Add button + picker -->
    <div v-if="auth.isEditor" class="mt-4">
      <button v-if="!showPicker" @click="loadPeopleIfNeeded"
        class="text-sm text-walnut-muted hover:text-walnut transition-colors">
        + Add {{ activeTab === 'parents' ? 'parent' : activeTab === 'children' ? 'child' : 'spouse' }}
      </button>

      <div v-else class="space-y-3 pt-2">
        <!-- Relationship type (parents + children) -->
        <div v-if="activeTab !== 'spouses'" class="flex gap-2">
          <select v-model="addRelType" class="input text-sm">
            <option value="biological">Biological</option>
            <option value="adopted">Adopted</option>
            <option value="step">Step</option>
            <option value="half">Half</option>
          </select>
        </div>

        <!-- Marriage fields (spouses) -->
        <div v-if="activeTab === 'spouses'" class="grid grid-cols-3 gap-2">
          <input v-model="addMarriageDate" type="date" class="input text-sm" placeholder="Marriage date" />
          <input v-model="addMarriagePlace" class="input text-sm" placeholder="Marriage place" />
          <select v-model="addEndReason" class="input text-sm">
            <option value="">Still married</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
            <option value="annulled">Annulled</option>
          </select>
        </div>

        <!-- Person search -->
        <input v-model="pickerQuery" class="input w-full text-sm" placeholder="Search by name…" />
        <div class="space-y-1 max-h-48 overflow-y-auto">
          <button v-for="p in pickerResults" :key="p.id"
            @click="activeTab === 'parents' ? addParent(p) : activeTab === 'children' ? addChild(p) : addSpouse(p)"
            class="w-full text-left px-3 py-2 rounded text-sm text-walnut hover:bg-parchment transition-colors">
            {{ displayName(p) }}
          </button>
          <p v-if="pickerResults.length === 0 && pickerQuery" class="text-walnut-muted text-sm px-3 py-2">No matches</p>
        </div>
        <button @click="showPicker = false" class="text-xs text-walnut-muted hover:text-walnut">Cancel</button>
      </div>
    </div>
  </div>
</template>
```

### Step 2: Type check + commit

```bash
npx vue-tsc --noEmit
git add src/components/RelationshipPanel.vue
git commit -m "feat: add RelationshipPanel component"
```

---

## Task 7: PeopleView

**Files:**
- Modify: `src/views/PeopleView.vue`

Replace the placeholder. Header with search + filters, results grid using `PersonCard`, create button for editors.

### Step 1: Replace `src/views/PeopleView.vue`

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { usePeopleStore } from '@/stores/people'
import { useAuthStore } from '@/stores/auth'
import PersonCard from '@/components/PersonCard.vue'
import PersonForm from '@/components/PersonForm.vue'
import type { PersonInput } from '@/types'

const people = usePeopleStore()
const auth   = useAuthStore()

const query       = ref('')
const birthYearMin = ref<number | undefined>()
const birthYearMax = ref<number | undefined>()
const location    = ref('')
const showForm    = ref(false)
const formError   = ref<string | null>(null)
let debounceTimer: ReturnType<typeof setTimeout>

function search() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    people.fetchPeople({
      query: query.value || undefined,
      birthYearMin: birthYearMin.value,
      birthYearMax: birthYearMax.value,
      location: location.value || undefined,
    })
  }, 300)
}

watch([query, birthYearMin, birthYearMax, location], search)

onMounted(() => people.fetchPeople())

async function handleSave(input: PersonInput) {
  formError.value = null
  try {
    await people.createPerson(input)
    showForm.value = false
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Failed to save'
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display text-3xl text-walnut">People</h1>
      <button v-if="auth.isEditor" @click="showForm = true" class="btn-primary">
        + Add Person
      </button>
    </div>

    <!-- Search bar -->
    <div class="card p-4 mb-6 space-y-3">
      <input v-model="query" class="input w-full" placeholder="Search by name, nickname, maiden name…" />
      <div class="grid grid-cols-3 gap-3">
        <input v-model.number="birthYearMin" type="number" class="input" placeholder="Born after" min="1800" max="2100" />
        <input v-model.number="birthYearMax" type="number" class="input" placeholder="Born before" min="1800" max="2100" />
        <input v-model="location" class="input" placeholder="Location" />
      </div>
    </div>

    <!-- Loading / error -->
    <p v-if="people.isLoading" class="text-walnut-muted text-center py-8">Loading…</p>
    <p v-else-if="people.error" class="text-red-600 text-center py-8">{{ people.error }}</p>

    <!-- Results -->
    <div v-else>
      <p class="text-walnut-muted text-sm mb-4">{{ people.list.length }} {{ people.list.length === 1 ? 'person' : 'people' }}</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <PersonCard v-for="person in people.list" :key="person.id" :person="person" />
      </div>
      <p v-if="people.list.length === 0" class="text-walnut-muted text-center py-12">
        No records found.
        <span v-if="auth.isEditor"> <button @click="showForm = true" class="underline hover:no-underline">Add the first person.</button></span>
      </p>
    </div>

    <PersonForm :is-open="showForm" @save="handleSave" @close="showForm = false" />
    <p v-if="formError" class="text-red-600 text-sm mt-2">{{ formError }}</p>
  </div>
</template>
```

### Step 2: Type check + commit

```bash
npx vue-tsc --noEmit
git add src/views/PeopleView.vue
git commit -m "feat: build PeopleView with search and create"
```

---

## Task 8: PersonView

**Files:**
- Modify: `src/views/PersonView.vue`

Full profile page. Sections: header, biography, residences, education, occupations, military, relationships panel. Edit button for editors.

### Step 1: Replace `src/views/PersonView.vue`

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePersonDetail } from '@/composables/usePersonDetail'
import { useResidences } from '@/composables/useResidences'
import { useEducation } from '@/composables/useEducation'
import { useOccupations } from '@/composables/useOccupations'
import { useMilitaryService } from '@/composables/useMilitaryService'
import { usePeopleStore } from '@/stores/people'
import { useAuthStore } from '@/stores/auth'
import RelationshipPanel from '@/components/RelationshipPanel.vue'
import PersonForm from '@/components/PersonForm.vue'
import type { PersonInput } from '@/types'

const route  = useRoute()
const id     = route.params.id as string
const auth   = useAuthStore()
const people = usePeopleStore()
const detail = usePersonDetail(id)
const residences = useResidences(id)
const education  = useEducation(id)
const occupations = useOccupations(id)
const military    = useMilitaryService(id)

const showEditForm = ref(false)
const saveError    = ref<string | null>(null)

async function loadAll() {
  await Promise.all([
    detail.load(),
    residences.fetch(),
    education.fetch(),
    occupations.fetch(),
    military.fetch(),
  ])
}

onMounted(loadAll)

async function handleSave(input: PersonInput) {
  saveError.value = null
  try {
    await people.updatePerson(id, input)
    await detail.load()
    showEditForm.value = false
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save'
  }
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function yearOf(d: string | null) {
  return d ? new Date(d).getFullYear() : null
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8">
    <!-- Loading -->
    <p v-if="detail.isLoading.value" class="text-walnut-muted text-center py-16">Loading…</p>
    <p v-else-if="detail.error.value" class="text-red-600 text-center py-16">{{ detail.error.value }}</p>

    <template v-else-if="detail.person.value">
      <!-- Header -->
      <div class="card p-8 mb-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="font-display text-4xl text-walnut leading-tight">
              {{ detail.person.value.firstName }}
              <span v-if="detail.person.value.nickname" class="text-walnut-muted">"{{ detail.person.value.nickname }}"</span>
              {{ detail.person.value.lastName }}
              <span v-if="detail.person.value.suffix" class="text-2xl"> {{ detail.person.value.suffix }}</span>
            </h1>
            <p v-if="detail.person.value.birthSurname" class="text-walnut-muted mt-1">née {{ detail.person.value.birthSurname }}</p>
            <p class="text-walnut-muted mt-2 text-sm">
              <span v-if="detail.person.value.birthDate">
                Born {{ formatDate(detail.person.value.birthDate) }}
                <span v-if="detail.person.value.birthPlace"> · {{ detail.person.value.birthPlace }}</span>
              </span>
              <span v-if="detail.person.value.deathDate">
                &nbsp;· Died {{ formatDate(detail.person.value.deathDate) }}
                <span v-if="detail.person.value.deathPlace"> · {{ detail.person.value.deathPlace }}</span>
              </span>
            </p>
          </div>
          <button v-if="auth.isEditor" @click="showEditForm = true" class="btn-secondary text-sm">Edit</button>
        </div>
      </div>

      <!-- Biography -->
      <div v-if="detail.person.value.biography" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Biography</h2>
        <p class="text-walnut leading-relaxed whitespace-pre-wrap">{{ detail.person.value.biography }}</p>
      </div>

      <!-- Notes -->
      <div v-if="detail.person.value.notes" class="card p-6 mb-6 bg-parchment/40">
        <h3 class="font-display text-lg text-walnut mb-2">Notes</h3>
        <p class="text-walnut-muted text-sm leading-relaxed">{{ detail.person.value.notes }}</p>
      </div>

      <!-- Residences -->
      <div v-if="detail.residences.value.length" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Residences</h2>
        <div class="space-y-2">
          <div v-for="r in detail.residences.value" :key="r.id" class="flex items-center justify-between text-sm">
            <span class="text-walnut">{{ r.location }}</span>
            <span class="text-walnut-muted">
              <template v-if="r.fromDate || r.toDate">
                {{ yearOf(r.fromDate) ?? '?' }} – {{ r.isCurrent ? 'present' : (yearOf(r.toDate) ?? '?') }}
              </template>
              <template v-else-if="r.isCurrent">Current</template>
            </span>
          </div>
        </div>
      </div>

      <!-- Education -->
      <div v-if="detail.education.value.length" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Education</h2>
        <div class="space-y-2">
          <div v-for="e in detail.education.value" :key="e.id" class="text-sm">
            <span class="text-walnut font-medium">{{ e.institution }}</span>
            <span class="text-walnut-muted ml-2 capitalize">{{ e.institutionType.replace('_', ' ') }}</span>
            <span v-if="e.startYear || e.endYear" class="text-walnut-muted ml-2">
              {{ e.startYear ?? '?' }} – {{ e.endYear ?? '?' }}
            </span>
            <span v-if="e.graduated === true" class="text-walnut-muted ml-2">· Graduated</span>
          </div>
        </div>
      </div>

      <!-- Occupations -->
      <div v-if="detail.occupations.value.length" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Occupations</h2>
        <div class="space-y-2">
          <div v-for="o in detail.occupations.value" :key="o.id" class="text-sm">
            <span class="text-walnut font-medium">{{ o.title ?? 'Unknown title' }}</span>
            <span v-if="o.employer" class="text-walnut-muted ml-2">at {{ o.employer }}</span>
            <span v-if="o.isCurrent" class="text-walnut-muted ml-2">· Current</span>
          </div>
        </div>
      </div>

      <!-- Military -->
      <div v-if="detail.militaryService.value.length" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Military Service</h2>
        <div class="space-y-2">
          <div v-for="m in detail.militaryService.value" :key="m.id" class="text-sm">
            <span class="text-walnut font-medium">{{ m.branch ?? 'Unknown branch' }}</span>
            <span v-if="m.rank" class="text-walnut-muted ml-2">{{ m.rank }}</span>
            <span v-if="m.fromDate || m.toDate" class="text-walnut-muted ml-2">
              {{ yearOf(m.fromDate) ?? '?' }} – {{ yearOf(m.toDate) ?? '?' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Relationships -->
      <RelationshipPanel
        :person-id="id"
        :parents="detail.parents.value"
        :children="detail.children.value"
        :spouses="detail.spouses.value"
        @reload="detail.load()"
        class="mb-6"
      />
    </template>

    <!-- Edit modal -->
    <PersonForm
      :is-open="showEditForm"
      :person="detail.person.value"
      @save="handleSave"
      @close="showEditForm = false"
    />
    <p v-if="saveError" class="text-red-600 text-sm mt-2">{{ saveError }}</p>
  </div>
</template>
```

### Step 2: Type check + commit

```bash
npx vue-tsc --noEmit
git add src/views/PersonView.vue
git commit -m "feat: build PersonView full profile page"
```

---

## Task 9: OnboardingView

**Files:**
- Modify: `src/views/OnboardingView.vue`
- Modify: `src/stores/auth.ts` (add `linkPerson` action)

The onboarding flow:
1. Auto-search `people` table by the user's registered first + last name using `ilike`
2. Show up to 5 matches — user picks "This is me" or "None of these"
3. If no match / skipped: show mini create form → insert person → link
4. "Skip for now" button always available → navigate to `/tree`

### Step 1: Add `linkPerson` action to `src/stores/auth.ts`

In `src/stores/auth.ts`, add this action inside the store (after `refreshProfile`):

```ts
async function linkPerson(personId: string) {
  if (!profile.value) return
  const { error: err } = await supabase
    .from('profiles')
    .update({ person_id: personId })
    .eq('id', profile.value.id)
  if (err) throw err
  profile.value = { ...profile.value, personId }
}
```

And add `linkPerson` to the return object.

### Step 2: Replace `src/views/OnboardingView.vue`

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePeopleStore } from '@/stores/people'
import type { PersonSummary, PersonInput } from '@/types'

const auth   = useAuthStore()
const people = usePeopleStore()
const router = useRouter()

type Step = 'searching' | 'matches' | 'no-match' | 'creating'
const step      = ref<Step>('searching')
const matches   = ref<PersonSummary[]>([])
const searchErr = ref<string | null>(null)
const isSaving  = ref(false)
const saveErr   = ref<string | null>(null)

// Mini create form state
const newPerson = ref<PersonInput>({
  firstName: auth.profile?.firstName ?? '',
  lastName:  auth.profile?.lastName ?? '',
  birthDate: null, birthPlace: null,
})

onMounted(async () => {
  if (!auth.profile) return
  try {
    const { data, error } = await supabase
      .from('people')
      .select('id, first_name, last_name, birth_surname, nickname, birth_date, death_date, primary_photo_id')
      .ilike('first_name', `%${auth.profile.firstName}%`)
      .ilike('last_name', `%${auth.profile.lastName}%`)
      .limit(5)

    if (error) throw error
    matches.value = (data ?? []).map(r => ({
      id: r.id, firstName: r.first_name, lastName: r.last_name,
      birthSurname: r.birth_surname, nickname: r.nickname,
      birthDate: r.birth_date, deathDate: r.death_date, primaryPhotoId: r.primary_photo_id,
    }))
    step.value = matches.value.length > 0 ? 'matches' : 'no-match'
  } catch (err) {
    searchErr.value = err instanceof Error ? err.message : 'Search failed'
    step.value = 'no-match'
  }
})

async function confirmMatch(person: PersonSummary) {
  isSaving.value = true
  saveErr.value = null
  try {
    await auth.linkPerson(person.id)
    router.push({ name: 'tree' })
  } catch (err) {
    saveErr.value = err instanceof Error ? err.message : 'Failed to link'
    isSaving.value = false
  }
}

async function createAndLink() {
  isSaving.value = true
  saveErr.value = null
  try {
    const person = await people.createPerson(newPerson.value)
    await auth.linkPerson(person.id)
    router.push({ name: 'tree' })
  } catch (err) {
    saveErr.value = err instanceof Error ? err.message : 'Failed to create'
    isSaving.value = false
  }
}

function skipForNow() {
  router.push({ name: 'tree' })
}

function formatYear(d: string | null) {
  return d ? new Date(d).getFullYear() : null
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-lg">
      <div class="card p-8">
        <h2 class="font-display text-2xl text-walnut mb-2">
          Welcome, {{ auth.profile?.firstName }}!
        </h2>
        <p class="text-walnut-muted text-sm mb-6 leading-relaxed">
          Let's find your record in the family tree so we can personalise your experience.
        </p>

        <!-- Searching -->
        <div v-if="step === 'searching'" class="text-walnut-muted text-sm text-center py-6">
          Searching family records…
        </div>

        <!-- Matches found -->
        <div v-else-if="step === 'matches'" class="space-y-3">
          <p class="text-sm text-walnut mb-4">We found some possible matches. Is one of these you?</p>
          <div v-for="person in matches" :key="person.id"
            class="border border-parchment rounded p-4 hover:border-walnut/40 transition-colors">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium text-walnut">
                  {{ person.firstName }} {{ person.lastName }}
                  <span v-if="person.nickname" class="font-normal text-walnut-muted">"{{ person.nickname }}"</span>
                </p>
                <p class="text-xs text-walnut-muted mt-0.5">
                  <span v-if="formatYear(person.birthDate)">b. {{ formatYear(person.birthDate) }}</span>
                  <span v-if="formatYear(person.deathDate)"> · d. {{ formatYear(person.deathDate) }}</span>
                </p>
              </div>
              <button @click="confirmMatch(person)" :disabled="isSaving" class="btn-primary text-sm">
                This is me
              </button>
            </div>
          </div>
          <button @click="step = 'no-match'" class="text-sm text-walnut-muted hover:text-walnut mt-2 block">
            None of these — create my record
          </button>
        </div>

        <!-- No match — mini create form -->
        <div v-else-if="step === 'no-match' || step === 'creating'">
          <p class="text-sm text-walnut-muted mb-4">
            No matching record found. We'll create one for you now.
          </p>
          <form @submit.prevent="createAndLink" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-walnut mb-1">First name *</label>
                <input v-model="newPerson.firstName" required class="input w-full" />
              </div>
              <div>
                <label class="block text-xs text-walnut mb-1">Last name *</label>
                <input v-model="newPerson.lastName" required class="input w-full" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-walnut mb-1">Birth date</label>
                <input v-model="newPerson.birthDate" type="date" class="input w-full" />
              </div>
              <div>
                <label class="block text-xs text-walnut mb-1">Birth place</label>
                <input v-model="newPerson.birthPlace" class="input w-full" placeholder="City, State" />
              </div>
            </div>
            <p v-if="saveErr" class="text-red-600 text-sm">{{ saveErr }}</p>
            <button type="submit" :disabled="isSaving" class="btn-primary w-full">
              {{ isSaving ? 'Saving…' : 'Create my record' }}
            </button>
          </form>
        </div>

        <p v-if="searchErr" class="text-red-600 text-xs mt-2">{{ searchErr }}</p>

        <button @click="skipForNow" class="mt-4 text-sm text-walnut-muted hover:text-walnut block w-full text-center">
          Skip for now
        </button>
      </div>
    </div>
  </div>
</template>
```

### Step 3: Run all tests

```bash
npm run test:run
```

Expected: all tests pass (7 auth + 6 people + 2 person-detail = 15 tests)

### Step 4: Type check

```bash
npx vue-tsc --noEmit
```

Expected: 0 errors

### Step 5: Commit

```bash
git add src/views/OnboardingView.vue src/stores/auth.ts
git commit -m "feat: activate OnboardingView with name-match and create flows"
```

---

## Final Verification

```bash
npm run test:run        # all 15 tests green
npx vue-tsc --noEmit   # 0 type errors
npm run build          # production build succeeds
```

If the build succeeds, Phase 2 is complete.
