# Phase 3 — Family Tree Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an interactive family tree (focused view) centered on one person, showing 4 generations with pan/zoom and a slide-over detail panel.

**Architecture:** Vue Flow renders the canvas with custom `TreeNode` Vue components as nodes and styled edges for parent-child and marriage relationships. A Pinia `tree` store fetches the 4-generation subgraph in two parallel rounds. A pure `useTreeLayout` composable converts that data into Vue Flow `{ nodes, edges }` with computed x/y positions.

**Tech Stack:** `@vue-flow/core` for pan/zoom canvas, Pinia store, Vitest for unit tests, existing Supabase client pattern, TailwindCSS heritage palette.

---

## Task 1: Install Vue Flow and import CSS

**Files:**
- Modify: `package.json` (via npm)
- Modify: `src/main.ts`

**Step 1: Install the package**

```bash
npm install @vue-flow/core
```

Expected: `@vue-flow/core` appears in `package.json` dependencies.

**Step 2: Add CSS import to main.ts**

Open `src/main.ts`. Add this line immediately after the existing CSS import:

```typescript
import '@vue-flow/core/dist/style.css'
```

The full import block should look like:
```typescript
import './style.css'
import '@vue-flow/core/dist/style.css'
```

**Step 3: Verify build passes**

```bash
npm run build
```

Expected: Build completes with no errors. If `@vue-flow/core/dist/style.css` path differs, check `node_modules/@vue-flow/core/dist/` for the correct CSS filename.

**Step 4: Commit**

```bash
git add package.json package-lock.json src/main.ts
git commit -m "chore: install @vue-flow/core"
```

---

## Task 2: Add tree types

**Files:**
- Modify: `src/types/index.ts`

The tree uses a `TreePerson` type (a slim subset of `Person` — only the fields the tree node and slide-over need). Add these types at the bottom of `src/types/index.ts`:

**Step 1: Append types**

```typescript
// ─── Tree ─────────────────────────────────────────────────────────────────────

export interface TreePerson {
  id: string
  firstName: string
  lastName: string
  birthSurname: string | null
  nickname: string | null
  birthDate: string | null
  deathDate: string | null
  primaryPhotoId: string | null
}

export interface TreeParentChildEdge {
  id: string
  parentId: string
  childId: string
  confirmed: boolean
}

export interface TreeMarriageEdge {
  id: string
  personAId: string
  personBId: string
  marriageDate: string | null
}

export interface TreeSubgraph {
  rootId: string
  people: TreePerson[]                 // all people in the subgraph (deduplicated)
  parentChildEdges: TreeParentChildEdge[]
  marriageEdges: TreeMarriageEdge[]
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
git commit -m "feat: add TreePerson and TreeSubgraph types"
```

---

## Task 3: Tree store

**Files:**
- Create: `src/stores/tree.ts`
- Create: `tests/unit/stores/tree.test.ts`

The store fetches the focused subgraph in two rounds:
- **Round 1** (parallel): root person, root's parent edges, root's child edges, root's marriages
- **Round 2** (parallel, depends on parent IDs from round 1): grandparent edges, parent marriages

### Step 1: Write the failing tests

Create `tests/unit/stores/tree.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockSingle  = vi.fn()
const mockIn      = vi.fn()
const mockOrFn    = vi.fn()
const mockEq      = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn((...a) => mockEq(...a)),
      in:     vi.fn((...a) => mockIn(...a)),
      or:     vi.fn((...a) => mockOrFn(...a)),
      single: vi.fn((...a) => mockSingle(...a)),
    })),
  },
}))

import { useTreeStore } from '@/stores/tree'

const PERSON_ROW = (id: string, firstName: string) => ({
  id, first_name: firstName, last_name: 'Smith', birth_surname: null,
  nickname: null, birth_date: '1920-01-01', death_date: null,
  primary_photo_id: null,
})

describe('useTreeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetches root person and builds subgraph with no relationships', async () => {
    // Round 1: root single, parent edges, child edges, root marriages
    mockSingle.mockResolvedValueOnce({ data: PERSON_ROW('root1', 'Alice'), error: null })
    mockEq.mockResolvedValue({ data: [], error: null })
    mockOrFn.mockResolvedValue({ data: [], error: null })
    // Round 2 skipped (no parent IDs)

    const store = useTreeStore()
    await store.fetchSubgraph('root1')

    expect(store.subgraph?.rootId).toBe('root1')
    expect(store.subgraph?.people).toHaveLength(1)
    expect(store.subgraph?.people[0].firstName).toBe('Alice')
    expect(store.subgraph?.parentChildEdges).toHaveLength(0)
    expect(store.subgraph?.marriageEdges).toHaveLength(0)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error when root fetch fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    mockEq.mockResolvedValue({ data: [], error: null })
    mockOrFn.mockResolvedValue({ data: [], error: null })

    const store = useTreeStore()
    await expect(store.fetchSubgraph('bad')).rejects.toThrow('not found')
    expect(store.error).toBe('not found')
    expect(store.isLoading).toBe(false)
  })

  it('deduplicates people appearing in multiple relationship roles', async () => {
    // Root has a parent who is also a spouse of another parent — same person appears twice
    const parentRow = PERSON_ROW('p1', 'Bob')
    const parentEdge = { id: 'pc1', parent_id: 'p1', child_id: 'root1', relationship_type: 'biological', confirmed: true, parent: parentRow }

    mockSingle.mockResolvedValueOnce({ data: PERSON_ROW('root1', 'Alice'), error: null })
    // parent edges (as child) — returns one edge with embedded parent
    mockEq
      .mockResolvedValueOnce({ data: [parentEdge], error: null }) // parent_child as child
      .mockResolvedValueOnce({ data: [], error: null })            // parent_child as parent
    mockOrFn
      .mockResolvedValueOnce({ data: [], error: null }) // root marriages
      .mockResolvedValueOnce({ data: [], error: null }) // grandparent edges (round 2)
      .mockResolvedValueOnce({ data: [], error: null }) // parent marriages (round 2)

    const store = useTreeStore()
    await store.fetchSubgraph('root1')

    // root + 1 parent = 2 people, no duplicates
    expect(store.subgraph?.people).toHaveLength(2)
    expect(store.subgraph?.parentChildEdges).toHaveLength(1)
  })
})
```

**Step 2: Run tests and verify they fail**

```bash
npm run test:run -- tests/unit/stores/tree.test.ts
```

Expected: FAIL — `Cannot find module '@/stores/tree'`

### Step 3: Implement the store

Create `src/stores/tree.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { TreePerson, TreeParentChildEdge, TreeMarriageEdge, TreeSubgraph } from '@/types'
import type { Database } from '@/types/database'

type PersonRow = Database['public']['Tables']['people']['Row']

function mapTreePerson(row: PersonRow): TreePerson {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthSurname: row.birth_surname,
    nickname: row.nickname,
    birthDate: row.birth_date,
    deathDate: row.death_date,
    primaryPhotoId: row.primary_photo_id,
  }
}

function dedupeById(people: TreePerson[]): TreePerson[] {
  const seen = new Set<string>()
  return people.filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

export const useTreeStore = defineStore('tree', () => {
  const subgraph  = ref<TreeSubgraph | null>(null)
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function fetchSubgraph(rootId: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      // ── Round 1: root + direct edges ───────────────────────────────────────
      const [rootRes, parentEdgesRes, childEdgesRes, rootMarriagesRes] = await Promise.all([
        supabase.from('people').select('*').eq('id', rootId).single(),
        supabase.from('parent_child')
          .select('*, parent:parent_id(*)')
          .eq('child_id', rootId),
        supabase.from('parent_child')
          .select('*, child:child_id(*)')
          .eq('parent_id', rootId),
        supabase.from('marriages')
          .select('*, person_a:person_a_id(*), person_b:person_b_id(*)')
          .or(`person_a_id.eq.${rootId},person_b_id.eq.${rootId}`),
      ])

      if (rootRes.error)         throw rootRes.error
      if (parentEdgesRes.error)  throw parentEdgesRes.error
      if (childEdgesRes.error)   throw childEdgesRes.error
      if (rootMarriagesRes.error) throw rootMarriagesRes.error

      const rootPerson = mapTreePerson(rootRes.data)

      const parentEdges: TreeParentChildEdge[] = (parentEdgesRes.data ?? []).map((r: Record<string, unknown>) => ({
        id:       r['id'] as string,
        parentId: r['parent_id'] as string,
        childId:  r['child_id'] as string,
        confirmed: r['confirmed'] as boolean,
      }))

      const childEdges: TreeParentChildEdge[] = (childEdgesRes.data ?? []).map((r: Record<string, unknown>) => ({
        id:       r['id'] as string,
        parentId: r['parent_id'] as string,
        childId:  r['child_id'] as string,
        confirmed: r['confirmed'] as boolean,
      }))

      const parentPeople: TreePerson[] = (parentEdgesRes.data ?? [])
        .filter((r: Record<string, unknown>) => r['parent'] != null)
        .map((r: Record<string, unknown>) => mapTreePerson(r['parent'] as PersonRow))

      const childPeople: TreePerson[] = (childEdgesRes.data ?? [])
        .filter((r: Record<string, unknown>) => r['child'] != null)
        .map((r: Record<string, unknown>) => mapTreePerson(r['child'] as PersonRow))

      const rootMarriageEdges: TreeMarriageEdge[] = (rootMarriagesRes.data ?? []).map((r: Record<string, unknown>) => ({
        id:           r['id'] as string,
        personAId:    r['person_a_id'] as string,
        personBId:    r['person_b_id'] as string,
        marriageDate: r['marriage_date'] as string | null,
      }))

      const rootSpousePeople: TreePerson[] = (rootMarriagesRes.data ?? [])
        .filter((r: Record<string, unknown>) => r['person_a'] != null && r['person_b'] != null)
        .map((r: Record<string, unknown>) => {
          const spouseRow = (r['person_a_id'] as string) === rootId
            ? r['person_b'] as PersonRow
            : r['person_a'] as PersonRow
          return mapTreePerson(spouseRow)
        })

      // ── Round 2: grandparents + parent marriages ────────────────────────────
      const parentIds = parentEdges.map(e => e.parentId)

      let grandparentEdges: TreeParentChildEdge[] = []
      let grandparentPeople: TreePerson[] = []
      let parentMarriageEdges: TreeMarriageEdge[] = []
      let parentSpousePeople: TreePerson[] = []

      if (parentIds.length > 0) {
        const orClause = parentIds.map(id => `person_a_id.eq.${id},person_b_id.eq.${id}`).join(',')
        const [gpEdgesRes, parentMarriagesRes] = await Promise.all([
          supabase.from('parent_child')
            .select('*, parent:parent_id(*)')
            .in('child_id', parentIds),
          supabase.from('marriages')
            .select('*, person_a:person_a_id(*), person_b:person_b_id(*)')
            .or(orClause),
        ])

        if (gpEdgesRes.error)        throw gpEdgesRes.error
        if (parentMarriagesRes.error) throw parentMarriagesRes.error

        grandparentEdges = (gpEdgesRes.data ?? []).map((r: Record<string, unknown>) => ({
          id:       r['id'] as string,
          parentId: r['parent_id'] as string,
          childId:  r['child_id'] as string,
          confirmed: r['confirmed'] as boolean,
        }))

        grandparentPeople = (gpEdgesRes.data ?? [])
          .filter((r: Record<string, unknown>) => r['parent'] != null)
          .map((r: Record<string, unknown>) => mapTreePerson(r['parent'] as PersonRow))

        parentMarriageEdges = (parentMarriagesRes.data ?? []).map((r: Record<string, unknown>) => ({
          id:           r['id'] as string,
          personAId:    r['person_a_id'] as string,
          personBId:    r['person_b_id'] as string,
          marriageDate: r['marriage_date'] as string | null,
        }))

        parentSpousePeople = (parentMarriagesRes.data ?? [])
          .filter((r: Record<string, unknown>) => r['person_a'] != null && r['person_b'] != null)
          .flatMap((r: Record<string, unknown>) => {
            const rows: TreePerson[] = []
            if (r['person_a']) rows.push(mapTreePerson(r['person_a'] as PersonRow))
            if (r['person_b']) rows.push(mapTreePerson(r['person_b'] as PersonRow))
            return rows
          })
      }

      // ── Assemble subgraph ──────────────────────────────────────────────────
      const allPeople = dedupeById([
        rootPerson,
        ...parentPeople,
        ...childPeople,
        ...rootSpousePeople,
        ...grandparentPeople,
        ...parentSpousePeople,
      ])

      const allParentChildEdges = dedupeById([
        ...parentEdges,
        ...childEdges,
        ...grandparentEdges,
      ] as unknown as TreePerson[]) as unknown as TreeParentChildEdge[]

      const allMarriageEdges = dedupeById([
        ...rootMarriageEdges,
        ...parentMarriageEdges,
      ] as unknown as TreePerson[]) as unknown as TreeMarriageEdge[]

      subgraph.value = {
        rootId,
        people: allPeople,
        parentChildEdges: allParentChildEdges,
        marriageEdges: allMarriageEdges,
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return { subgraph, isLoading, error, fetchSubgraph }
})
```

**Step 4: Run tests and verify they pass**

```bash
npm run test:run -- tests/unit/stores/tree.test.ts
```

Expected: 3 passing.

**Step 5: Type-check**

```bash
npx vue-tsc --noEmit
```

Expected: 0 errors.

**Step 6: Commit**

```bash
git add src/stores/tree.ts tests/unit/stores/tree.test.ts
git commit -m "feat: add tree store with subgraph fetching"
```

---

## Task 4: useTreeLayout composable

**Files:**
- Create: `src/composables/useTreeLayout.ts`
- Create: `tests/unit/composables/useTreeLayout.test.ts`

This is a pure function. It takes a `TreeSubgraph` and returns Vue Flow `Node[]` and `Edge[]` with computed x/y positions.

**Layout constants:**
- `NODE_W = 180`, `NODE_H = 80`
- `H_GAP = 44` — horizontal gap between nodes in same row
- `V_GAP = 100` — vertical gap between generations
- Generation rows: -2 (grandparents), -1 (parents+spouses), 0 (root+spouses), +1 (children)

### Step 1: Write failing tests

Create `tests/unit/composables/useTreeLayout.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildTreeLayout } from '@/composables/useTreeLayout'
import type { TreeSubgraph } from '@/types'

function person(id: string): import('@/types').TreePerson {
  return { id, firstName: 'A', lastName: 'B', birthSurname: null, nickname: null, birthDate: null, deathDate: null, primaryPhotoId: null }
}

describe('buildTreeLayout', () => {
  it('places root at generation 0 center', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root')],
      parentChildEdges: [],
      marriageEdges: [],
    }
    const { nodes } = buildTreeLayout(subgraph)
    const rootNode = nodes.find(n => n.id === 'root')
    expect(rootNode).toBeDefined()
    expect(rootNode!.position.x).toBe(0)
    expect(rootNode!.position.y).toBe(0)
    expect(rootNode!.data.isRoot).toBe(true)
  })

  it('places a parent above root (negative y)', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('parent1')],
      parentChildEdges: [{ id: 'pc1', parentId: 'parent1', childId: 'root', confirmed: true }],
      marriageEdges: [],
    }
    const { nodes } = buildTreeLayout(subgraph)
    const parentNode = nodes.find(n => n.id === 'parent1')
    expect(parentNode).toBeDefined()
    expect(parentNode!.position.y).toBeLessThan(0) // above root
  })

  it('places a child below root (positive y)', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('child1')],
      parentChildEdges: [{ id: 'pc1', parentId: 'root', childId: 'child1', confirmed: true }],
      marriageEdges: [],
    }
    const { nodes } = buildTreeLayout(subgraph)
    const childNode = nodes.find(n => n.id === 'child1')
    expect(childNode).toBeDefined()
    expect(childNode!.position.y).toBeGreaterThan(0) // below root
  })

  it('creates a solid edge for a confirmed parent-child relationship', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('parent1')],
      parentChildEdges: [{ id: 'pc1', parentId: 'parent1', childId: 'root', confirmed: true }],
      marriageEdges: [],
    }
    const { edges } = buildTreeLayout(subgraph)
    const edge = edges.find(e => e.id === 'pc-pc1')
    expect(edge).toBeDefined()
    expect(edge!.style?.strokeDasharray).toBeUndefined()
  })

  it('creates a dashed edge for an unconfirmed parent-child relationship', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('parent1')],
      parentChildEdges: [{ id: 'pc1', parentId: 'parent1', childId: 'root', confirmed: false }],
      marriageEdges: [],
    }
    const { edges } = buildTreeLayout(subgraph)
    const edge = edges.find(e => e.id === 'pc-pc1')
    expect(edge!.style?.strokeDasharray).toBeDefined()
  })

  it('creates an edge for a marriage', () => {
    const subgraph: TreeSubgraph = {
      rootId: 'root',
      people: [person('root'), person('spouse1')],
      parentChildEdges: [],
      marriageEdges: [{ id: 'm1', personAId: 'root', personBId: 'spouse1', marriageDate: null }],
    }
    const { edges } = buildTreeLayout(subgraph)
    const edge = edges.find(e => e.id === 'm-m1')
    expect(edge).toBeDefined()
    expect(edge!.source).toBe('root')
    expect(edge!.target).toBe('spouse1')
  })
})
```

**Step 2: Run to verify failure**

```bash
npm run test:run -- tests/unit/composables/useTreeLayout.test.ts
```

Expected: FAIL — `Cannot find module '@/composables/useTreeLayout'`

### Step 3: Implement the composable

Create `src/composables/useTreeLayout.ts`:

```typescript
import type { Node, Edge } from '@vue-flow/core'
import type { TreeSubgraph, TreePerson } from '@/types'

const NODE_W = 180
const NODE_H = 80
const H_GAP  = 44
const V_GAP  = 100

// Generation row Y offsets from root (generation 0)
const GEN_Y: Record<number, number> = {
  [-2]: -2 * (NODE_H + V_GAP),
  [-1]: -1 * (NODE_H + V_GAP),
  [0]:  0,
  [1]:  NODE_H + V_GAP,
}

type NodeData = { person: TreePerson; isRoot: boolean }

function rowX(index: number, total: number): number {
  const totalWidth = total * NODE_W + (total - 1) * H_GAP
  return index * (NODE_W + H_GAP) - totalWidth / 2 + NODE_W / 2
}

export function buildTreeLayout(subgraph: TreeSubgraph): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const { rootId, people, parentChildEdges, marriageEdges } = subgraph

  // ── Assign generations ──────────────────────────────────────────────────────
  const generations = new Map<string, number>()
  generations.set(rootId, 0)

  // Parents of root → gen -1
  for (const e of parentChildEdges) {
    if (e.childId === rootId) generations.set(e.parentId, -1)
  }
  // Grandparents → gen -2
  for (const e of parentChildEdges) {
    const childGen = generations.get(e.childId)
    if (childGen === -1) generations.set(e.parentId, -2)
  }
  // Children → gen +1
  for (const e of parentChildEdges) {
    if (e.parentId === rootId) generations.set(e.childId, 1)
  }

  // Spouses inherit the same generation as their partner
  for (const m of marriageEdges) {
    if (generations.has(m.personAId) && !generations.has(m.personBId)) {
      generations.set(m.personBId, generations.get(m.personAId)!)
    } else if (generations.has(m.personBId) && !generations.has(m.personAId)) {
      generations.set(m.personAId, generations.get(m.personBId)!)
    }
  }

  // People with no assigned generation default to gen 0
  for (const p of people) {
    if (!generations.has(p.id)) generations.set(p.id, 0)
  }

  // ── Group people by generation for horizontal layout ────────────────────────
  const byGen = new Map<number, TreePerson[]>()
  for (const p of people) {
    const g = generations.get(p.id) ?? 0
    if (!byGen.has(g)) byGen.set(g, [])
    byGen.get(g)!.push(p)
  }

  // ── Build Vue Flow nodes ────────────────────────────────────────────────────
  const nodes: Node<NodeData>[] = []
  for (const [gen, row] of byGen) {
    const y = GEN_Y[gen] ?? gen * (NODE_H + V_GAP)
    row.forEach((person, i) => {
      nodes.push({
        id: person.id,
        type: 'person',
        position: { x: rowX(i, row.length), y },
        data: { person, isRoot: person.id === rootId },
      })
    })
  }

  // ── Build Vue Flow edges ────────────────────────────────────────────────────
  const edges: Edge[] = []

  for (const e of parentChildEdges) {
    edges.push({
      id: `pc-${e.id}`,
      source: e.parentId,
      target: e.childId,
      type: 'smoothstep',
      style: e.confirmed
        ? { stroke: '#8B6F5E', strokeWidth: 1.5 }
        : { stroke: '#8B6F5E', strokeWidth: 1.5, strokeDasharray: '6,4' },
    })
  }

  for (const m of marriageEdges) {
    edges.push({
      id: `m-${m.id}`,
      source: m.personAId,
      target: m.personBId,
      type: 'straight',
      style: { stroke: '#C4856A', strokeWidth: 2 },
    })
  }

  return { nodes, edges }
}
```

**Step 4: Run tests and verify they pass**

```bash
npm run test:run -- tests/unit/composables/useTreeLayout.test.ts
```

Expected: 5 passing.

**Step 5: Commit**

```bash
git add src/composables/useTreeLayout.ts tests/unit/composables/useTreeLayout.test.ts
git commit -m "feat: add useTreeLayout composable with generational positioning"
```

---

## Task 5: TreeNode component

**Files:**
- Create: `src/components/tree/TreeNode.vue`

This is a custom Vue Flow node rendered for each person. Vue Flow passes `data` as a prop. No tests needed — it's a display component.

**Step 1: Create the component**

Create `src/components/tree/TreeNode.vue`:

```vue
<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { TreePerson } from '@/types'

const props = defineProps<{
  data: { person: TreePerson; isRoot: boolean }
}>()

function lifespan(p: TreePerson): string {
  const birth = p.birthDate ? new Date(p.birthDate).getFullYear() : '?'
  if (!p.deathDate) return String(birth)
  const death = new Date(p.deathDate).getFullYear()
  return `${birth} – ${death}`
}

function displayName(p: TreePerson): string {
  if (p.nickname) return `${p.firstName} "${p.nickname}" ${p.lastName}`
  return `${p.firstName} ${p.lastName}`
}
</script>

<template>
  <div
    class="tree-node"
    :class="{
      'tree-node--root': data.isRoot,
      'tree-node--deceased': !!data.person.deathDate,
    }"
  >
    <Handle type="target" :position="Position.Top" class="tree-handle" />

    <!-- Photo placeholder -->
    <div class="tree-node__photo">
      <span class="tree-node__initials">
        {{ data.person.firstName[0] }}{{ data.person.lastName[0] }}
      </span>
    </div>

    <!-- Name and dates -->
    <div class="tree-node__info">
      <p class="tree-node__name">{{ displayName(data.person) }}</p>
      <p class="tree-node__dates">{{ lifespan(data.person) }}</p>
    </div>

    <Handle type="source" :position="Position.Bottom" class="tree-handle" />
  </div>
</template>

<style scoped>
.tree-node {
  width: 180px;
  padding: 10px 12px;
  background: #FDFAF5;
  border: 1.5px solid #D4C5A9;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(61, 43, 31, 0.08);
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.tree-node:hover {
  box-shadow: 0 4px 12px rgba(61, 43, 31, 0.15);
  transform: translateY(-1px);
}
.tree-node--root {
  border-color: #C4856A;
  border-width: 2px;
  background: #FEF6F0;
}
.tree-node--deceased {
  opacity: 0.75;
}
.tree-node__photo {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #D4C5A9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tree-node__initials {
  font-size: 12px;
  font-weight: 600;
  color: #3D2B1F;
  font-family: 'Playfair Display', Georgia, serif;
}
.tree-node__info {
  min-width: 0;
}
.tree-node__name {
  font-size: 12px;
  font-weight: 600;
  color: #3D2B1F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Playfair Display', Georgia, serif;
  line-height: 1.3;
}
.tree-node__dates {
  font-size: 11px;
  color: #8B6F5E;
  margin-top: 2px;
}
.tree-handle {
  opacity: 0;
  pointer-events: none;
}
</style>
```

**Step 2: Type-check**

```bash
npx vue-tsc --noEmit
```

Expected: 0 errors.

**Step 3: Commit**

```bash
git add src/components/tree/TreeNode.vue
git commit -m "feat: add TreeNode heritage card component"
```

---

## Task 6: PersonSlideOver component

**Files:**
- Create: `src/components/tree/PersonSlideOver.vue`

This slide-over uses `usePersonDetail` (already exists) to load the selected person's full data when a `personId` is passed in.

**Step 1: Create the component**

Create `src/components/tree/PersonSlideOver.vue`:

```vue
<script setup lang="ts">
import { watch } from 'vue'
import { usePersonDetail } from '@/composables/usePersonDetail'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  personId: string | null
}>()

const emit = defineEmits<{
  navigate: [personId: string]
  close: []
}>()

const auth   = useAuthStore()
const detail = usePersonDetail(props.personId ?? '')

watch(() => props.personId, async (id) => {
  if (id) {
    // Re-initialise with new id by calling load on a fresh composable instance
    Object.assign(detail, usePersonDetail(id))
    await detail.load()
  }
}, { immediate: true })

function formatYear(d: string | null): string | null {
  if (!d) return null
  return String(new Date(d).getFullYear())
}

function fullName(p: { firstName: string; lastName: string; nickname?: string | null }): string {
  if (p.nickname) return `${p.firstName} "${p.nickname}" ${p.lastName}`
  return `${p.firstName} ${p.lastName}`
}
</script>

<template>
  <Transition name="slide-over">
    <div v-if="personId" class="slide-over">
      <!-- Backdrop -->
      <div class="slide-over__backdrop" @click="emit('close')" />

      <!-- Panel -->
      <div class="slide-over__panel">
        <!-- Header -->
        <div class="flex items-center justify-between mb-5">
          <h2 class="font-display text-xl text-walnut">
            {{ detail.person.value ? fullName(detail.person.value) : '…' }}
          </h2>
          <button @click="emit('close')" class="text-walnut-muted hover:text-walnut transition-colors p-1">
            ✕
          </button>
        </div>

        <div v-if="detail.isLoading.value" class="text-walnut-muted text-sm text-center py-8">Loading…</div>
        <div v-else-if="detail.error.value" class="text-red-600 text-sm py-4">{{ detail.error.value }}</div>

        <template v-else-if="detail.person.value">
          <!-- Vital dates -->
          <div class="text-sm text-walnut-muted space-y-1 mb-5">
            <p v-if="detail.person.value.birthDate || detail.person.value.birthPlace">
              <span class="text-walnut font-medium">Born</span>
              {{ [formatYear(detail.person.value.birthDate), detail.person.value.birthPlace].filter(Boolean).join(' · ') }}
            </p>
            <p v-if="detail.person.value.deathDate || detail.person.value.deathPlace">
              <span class="text-walnut font-medium">Died</span>
              {{ [formatYear(detail.person.value.deathDate), detail.person.value.deathPlace].filter(Boolean).join(' · ') }}
            </p>
          </div>

          <hr class="border-parchment mb-4" />

          <!-- Parents -->
          <div v-if="detail.parents.value.length" class="mb-4">
            <p class="text-xs font-medium text-walnut-muted uppercase tracking-wide mb-2">Parents</p>
            <div class="space-y-1">
              <button
                v-for="{ person: p } in detail.parents.value"
                :key="p.id"
                @click="emit('navigate', p.id)"
                class="block text-sm text-walnut hover:text-walnut-light hover:underline transition-colors"
              >
                {{ fullName(p) }}
              </button>
            </div>
          </div>

          <!-- Spouses -->
          <div v-if="detail.spouses.value.length" class="mb-4">
            <p class="text-xs font-medium text-walnut-muted uppercase tracking-wide mb-2">
              {{ detail.spouses.value.length === 1 ? 'Spouse' : 'Spouses' }}
            </p>
            <div class="space-y-1">
              <button
                v-for="{ person: p, marriage: m } in detail.spouses.value"
                :key="p.id"
                @click="emit('navigate', p.id)"
                class="block text-sm text-walnut hover:text-walnut-light hover:underline transition-colors"
              >
                {{ fullName(p) }}
                <span v-if="m.marriageDate" class="text-walnut-muted">
                  (m. {{ formatYear(m.marriageDate) }})
                </span>
              </button>
            </div>
          </div>

          <!-- Children -->
          <div v-if="detail.children.value.length" class="mb-5">
            <p class="text-xs font-medium text-walnut-muted uppercase tracking-wide mb-2">Children</p>
            <div class="space-y-1">
              <button
                v-for="{ person: p } in detail.children.value"
                :key="p.id"
                @click="emit('navigate', p.id)"
                class="block text-sm text-walnut hover:text-walnut-light hover:underline transition-colors"
              >
                {{ fullName(p) }}
              </button>
            </div>
          </div>

          <hr class="border-parchment mb-4" />

          <!-- Actions -->
          <div class="flex gap-2">
            <RouterLink
              :to="{ name: 'person', params: { id: personId } }"
              class="btn-primary text-sm flex-1 text-center"
            >
              View Full Profile
            </RouterLink>
            <RouterLink
              v-if="auth.isEditor"
              :to="{ name: 'person', params: { id: personId } }"
              class="btn-secondary text-sm"
            >
              Edit
            </RouterLink>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-over {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
}
.slide-over__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(61, 43, 31, 0.15);
}
.slide-over__panel {
  position: relative;
  width: 340px;
  height: 100%;
  background: #FDFAF5;
  border-left: 1px solid #D4C5A9;
  padding: 24px 20px;
  overflow-y: auto;
  box-shadow: -4px 0 20px rgba(61, 43, 31, 0.1);
}

/* Slide-in animation */
.slide-over-enter-active,
.slide-over-leave-active {
  transition: opacity 0.2s ease;
}
.slide-over-enter-active .slide-over__panel,
.slide-over-leave-active .slide-over__panel {
  transition: transform 0.25s ease;
}
.slide-over-enter-from,
.slide-over-leave-to {
  opacity: 0;
}
.slide-over-enter-from .slide-over__panel,
.slide-over-leave-to .slide-over__panel {
  transform: translateX(100%);
}
</style>
```

**Step 2: Type-check**

```bash
npx vue-tsc --noEmit
```

Expected: 0 errors.

**Step 3: Commit**

```bash
git add src/components/tree/PersonSlideOver.vue
git commit -m "feat: add PersonSlideOver panel component"
```

---

## Task 7: Wire up TreeView

**Files:**
- Modify: `src/views/TreeView.vue`

Replace the placeholder. This view:
1. Reads `?root` query param to determine the root person ID
2. Falls back to `auth.profile.personId` if no param
3. Shows a person picker overlay if neither is available
4. Fetches the subgraph via `useTreeStore`
5. Passes result through `buildTreeLayout`
6. Renders with `VueFlow` and the `TreeNode` custom node
7. Opens `PersonSlideOver` on node click

**Step 1: Replace TreeView.vue**

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { NodeMouseEvent } from '@vue-flow/core'
import { useAuthStore } from '@/stores/auth'
import { usePeopleStore } from '@/stores/people'
import { useTreeStore } from '@/stores/tree'
import { buildTreeLayout } from '@/composables/useTreeLayout'
import TreeNode from '@/components/tree/TreeNode.vue'
import PersonSlideOver from '@/components/tree/PersonSlideOver.vue'

const route   = useRoute()
const router  = useRouter()
const auth    = useAuthStore()
const people  = usePeopleStore()
const tree    = useTreeStore()
const { fitView } = useVueFlow()

// ── Root person ───────────────────────────────────────────────────────────────
const rootId = computed<string | null>(() => {
  const param = route.query.root
  if (typeof param === 'string' && param) return param
  return auth.profile?.personId ?? null
})

// ── Person picker (when no root is known) ────────────────────────────────────
const showPicker    = ref(false)
const pickerQuery   = ref('')
const pickerResults = computed(() =>
  people.list
    .filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(pickerQuery.value.toLowerCase()))
    .slice(0, 10)
)

async function openPicker() {
  if (people.list.length === 0) await people.fetchPeople()
  pickerQuery.value = ''
  showPicker.value  = true
}

function selectRoot(id: string) {
  showPicker.value = false
  router.replace({ name: 'tree', query: { root: id } })
}

// ── Layout ────────────────────────────────────────────────────────────────────
const nodes = ref<ReturnType<typeof buildTreeLayout>['nodes']>([])
const edges = ref<ReturnType<typeof buildTreeLayout>['edges']>([])

async function loadTree(id: string) {
  await tree.fetchSubgraph(id)
  if (tree.subgraph) {
    const layout = buildTreeLayout(tree.subgraph)
    nodes.value = layout.nodes
    edges.value = layout.edges
    // fitView after DOM update
    setTimeout(() => fitView({ padding: 0.2 }), 50)
  }
}

// ── Slide-over ────────────────────────────────────────────────────────────────
const selectedPersonId = ref<string | null>(null)

function onNodeClick({ node }: NodeMouseEvent) {
  selectedPersonId.value = node.id
}

function navigateTo(personId: string) {
  selectedPersonId.value = null
  router.push({ name: 'tree', query: { root: personId } })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (rootId.value) {
    await loadTree(rootId.value)
  } else {
    await openPicker()
  }
})

watch(rootId, async (id) => {
  if (id) {
    selectedPersonId.value = null
    await loadTree(id)
  }
})
</script>

<template>
  <div class="tree-view">
    <!-- Loading -->
    <div v-if="tree.isLoading" class="tree-view__status">
      <p class="text-walnut-muted">Loading family tree…</p>
    </div>

    <!-- Error -->
    <div v-else-if="tree.error" class="tree-view__status">
      <p class="text-red-600">{{ tree.error }}</p>
    </div>

    <!-- Tree canvas -->
    <VueFlow
      v-else-if="nodes.length"
      :nodes="nodes"
      :edges="edges"
      :fit-view-on-init="true"
      :zoom-on-scroll="true"
      :pan-on-drag="true"
      :nodes-draggable="false"
      class="tree-canvas"
      @node-click="onNodeClick"
    >
      <template #node-person="nodeProps">
        <TreeNode v-bind="nodeProps" />
      </template>
    </VueFlow>

    <!-- Empty state -->
    <div v-else class="tree-view__status">
      <p class="text-walnut-muted mb-4">No tree data found.</p>
      <button class="btn-secondary" @click="openPicker">Choose a person</button>
    </div>

    <!-- Slide-over -->
    <PersonSlideOver
      :person-id="selectedPersonId"
      @navigate="navigateTo"
      @close="selectedPersonId = null"
    />

    <!-- Person picker overlay -->
    <Transition name="fade">
      <div v-if="showPicker" class="picker-overlay">
        <div class="picker-modal card p-6">
          <h2 class="font-display text-xl text-walnut mb-4">Choose a starting person</h2>
          <input
            v-model="pickerQuery"
            class="input w-full mb-3"
            placeholder="Search by name…"
            autofocus
          />
          <div class="space-y-1 max-h-64 overflow-y-auto">
            <button
              v-for="p in pickerResults"
              :key="p.id"
              @click="selectRoot(p.id)"
              class="w-full text-left px-3 py-2 text-sm text-walnut hover:bg-parchment rounded transition-colors"
            >
              {{ p.firstName }} {{ p.lastName }}
              <span v-if="p.birthDate" class="text-walnut-muted ml-1 text-xs">
                (b. {{ new Date(p.birthDate).getFullYear() }})
              </span>
            </button>
            <p v-if="pickerResults.length === 0 && pickerQuery" class="text-walnut-muted text-sm px-3 py-2">
              No matches for "{{ pickerQuery }}"
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tree-view {
  width: 100%;
  height: calc(100vh - 64px); /* subtract nav height */
  position: relative;
}
.tree-canvas {
  width: 100%;
  height: 100%;
  background: #F5F0E8;
}
.tree-view__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(61, 43, 31, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.picker-modal {
  width: 400px;
  max-width: calc(100vw - 32px);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

**Step 2: Type-check**

```bash
npx vue-tsc --noEmit
```

Expected: 0 errors. If Vue Flow types complain about `NodeMouseEvent`, check the import — it may be `import type { NodeMouseEvent } from '@vue-flow/core'`.

**Step 3: Run the dev server and manually verify**

```bash
npm run dev
```

Navigate to `/tree`. Check:
- [ ] Canvas renders with heritage cream background
- [ ] Person nodes appear as styled cards
- [ ] Pan and scroll-to-zoom work
- [ ] Clicking a node opens the slide-over from the right
- [ ] Clicking a name in the slide-over re-centers the tree (URL updates)
- [ ] Browser back button returns to previous root
- [ ] If no root, person picker overlay appears

**Step 4: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass (existing 7 + new tree store 3 + layout 5 = 15 total).

**Step 5: Commit**

```bash
git add src/views/TreeView.vue
git commit -m "feat: build Phase 3 interactive family tree with Vue Flow"
```

---

## Completion Checklist

- [ ] Task 1: Vue Flow installed, CSS imported, build passes
- [ ] Task 2: Tree types added, type-check passes
- [ ] Task 3: Tree store implemented, 3 tests passing
- [ ] Task 4: Layout composable implemented, 5 tests passing
- [ ] Task 5: TreeNode heritage card component created
- [ ] Task 6: PersonSlideOver panel component created
- [ ] Task 7: TreeView wired up, all 15 tests passing, manual smoke test passes
