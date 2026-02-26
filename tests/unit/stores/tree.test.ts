import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockSingle  = vi.fn()
const mockIn      = vi.fn()
const mockOrFn    = vi.fn()
const mockEq      = vi.fn()

// Each from() returns a fresh chainable that is also thenable.
// Awaiting the chainable resolves via mockEq (for .eq() terminal queries).
// .single() on the chainable resolves via mockSingle.
// .in() and .or() resolve directly via their mocks.
const makeChainable = () => {
  const chain: {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    or: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => void
  } = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    in:     vi.fn((...a: unknown[]) => mockIn(...a)),
    or:     vi.fn((...a: unknown[]) => mockOrFn(...a)),
    single: vi.fn((...a: unknown[]) => mockSingle(...a)),
    then:   (resolve, reject) => {
      const result = mockEq()
      if (result && typeof result.then === 'function') {
        result.then(resolve, reject)
      } else {
        resolve(result)
      }
    },
  }
  return chain
}

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => makeChainable()),
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
    const parentRow = PERSON_ROW('p1', 'Bob')
    const parentEdge = { id: 'pc1', parent_id: 'p1', child_id: 'root1', relationship_type: 'biological', confirmed: true, parent: parentRow }

    mockSingle.mockResolvedValueOnce({ data: PERSON_ROW('root1', 'Alice'), error: null })
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
