import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ── Hoisted mock setup ─────────────────────────────────────────────────────────
const { mockInsert, mockSelect, mockEq, mockSingle, mockFrom } = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockEq = vi.fn().mockReturnThis()
  const mockSelect = vi.fn().mockReturnThis()
  const mockInsert = vi.fn().mockReturnThis()

  const mockChainParentChild = {
    insert: vi.fn(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }
  const mockChainMarriages = {
    insert: vi.fn(),
  }

  const mockFrom = vi.fn((table: string) => {
    if (table === 'parent_child') return mockChainParentChild
    if (table === 'marriages') return mockChainMarriages
    if (table === 'people') {
      return {
        insert: mockInsert,
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      }
    }
    return { insert: mockInsert, select: mockSelect, eq: mockEq, single: mockSingle }
  })

  return { mockInsert, mockSelect, mockEq, mockSingle, mockFrom }
})

vi.mock('@/services/supabase', () => ({
  supabase: { from: mockFrom },
}))

vi.mock('@/stores/people', () => ({
  usePeopleStore: vi.fn(() => ({
    list: [],
    fetchPeople: vi.fn().mockResolvedValue(undefined),
  })),
}))

import RelationshipSuggestions from '@/components/RelationshipSuggestions.vue'
import type { RelationshipSuggestion, PersonSummary } from '@/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUBJECT_PERSON_ID = 'subject-1'

const MATCHED_PERSON: PersonSummary = {
  id: 'matched-1',
  firstName: 'Mary',
  lastName: 'Doe',
  birthSurname: null,
  nickname: null,
  birthDate: '1925-03-15',
  deathDate: null,
  primaryPhotoId: null,
}

function makeSuggestion(
  type: RelationshipSuggestion['relationshipType'],
  matchedPerson?: PersonSummary,
): RelationshipSuggestion {
  return {
    mentionedName: 'Mary Doe',
    relationshipType: type,
    mentionContext: 'Her mother Mary Doe was born in 1925.',
    uncertain: false,
    matchedPerson,
  }
}

function mountComponent(suggestions: RelationshipSuggestion[]) {
  return mount(RelationshipSuggestions, {
    props: { suggestions, personId: SUBJECT_PERSON_ID },
    global: { plugins: [createPinia()] },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('RelationshipSuggestions — relationship type DB payloads', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Reset all chain mocks
    const parentChildChain = mockFrom('parent_child') as { insert: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> }
    parentChildChain.insert.mockResolvedValue({ error: null })
    parentChildChain.select.mockReturnThis()
    parentChildChain.eq.mockReturnThis()

    const marriagesChain = mockFrom('marriages') as { insert: ReturnType<typeof vi.fn> }
    marriagesChain.insert.mockResolvedValue({ error: null })
  })

  it('parent: inserts parent_child with parent_id=matchedPersonId, child_id=subjectPersonId', async () => {
    const wrapper = mountComponent([makeSuggestion('parent', MATCHED_PERSON)])
    await flushPromises()

    // Click the "Link Mary" button
    const linkBtn = wrapper.find('button.btn-primary')
    await linkBtn.trigger('click')
    await flushPromises()

    const parentChildChain = mockFrom('parent_child') as { insert: ReturnType<typeof vi.fn> }
    expect(parentChildChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: MATCHED_PERSON.id,
        child_id: SUBJECT_PERSON_ID,
        relationship_type: 'biological',
        confirmed: true,
      }),
    )
  })

  it('child: inserts parent_child with parent_id=subjectPersonId, child_id=matchedPersonId', async () => {
    const wrapper = mountComponent([makeSuggestion('child', MATCHED_PERSON)])
    await flushPromises()

    const linkBtn = wrapper.find('button.btn-primary')
    await linkBtn.trigger('click')
    await flushPromises()

    const parentChildChain = mockFrom('parent_child') as { insert: ReturnType<typeof vi.fn> }
    expect(parentChildChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: SUBJECT_PERSON_ID,
        child_id: MATCHED_PERSON.id,
        relationship_type: 'biological',
        confirmed: true,
      }),
    )
  })

  it('spouse: inserts into marriages with person_a_id=subjectPersonId, person_b_id=matchedPersonId', async () => {
    const wrapper = mountComponent([makeSuggestion('spouse', MATCHED_PERSON)])
    await flushPromises()

    const linkBtn = wrapper.find('button.btn-primary')
    await linkBtn.trigger('click')
    await flushPromises()

    const marriagesChain = mockFrom('marriages') as { insert: ReturnType<typeof vi.fn> }
    expect(marriagesChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        person_a_id: SUBJECT_PERSON_ID,
        person_b_id: MATCHED_PERSON.id,
      }),
    )
  })

  it('sibling: looks up subject parents, then inserts parent_child for each parent linking matched person as child', async () => {
    const parentRows = [{ parent_id: 'parent-a' }, { parent_id: 'parent-b' }]

    // Sibling path: first call to parent_child is a select().eq() chain returning parent rows,
    // subsequent calls are inserts
    const parentChildChain = mockFrom('parent_child') as { insert: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> }
    parentChildChain.select.mockReturnThis()
    parentChildChain.eq.mockResolvedValueOnce({ data: parentRows, error: null })
    parentChildChain.insert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })

    const wrapper = mountComponent([makeSuggestion('sibling', MATCHED_PERSON)])
    await flushPromises()

    const linkBtn = wrapper.find('button.btn-primary')
    await linkBtn.trigger('click')
    await flushPromises()

    expect(parentChildChain.eq).toHaveBeenCalledWith('child_id', SUBJECT_PERSON_ID)
    expect(parentChildChain.insert).toHaveBeenCalledTimes(2)
    expect(parentChildChain.insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ parent_id: 'parent-a', child_id: MATCHED_PERSON.id }),
    )
    expect(parentChildChain.insert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ parent_id: 'parent-b', child_id: MATCHED_PERSON.id }),
    )
  })
})

describe('RelationshipSuggestions — sibling parent lookup failure', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows "Cannot link sibling — add parents first" error when no parents exist', async () => {
    const parentChildChain = mockFrom('parent_child') as { insert: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> }
    parentChildChain.select.mockReturnThis()
    parentChildChain.eq.mockResolvedValueOnce({ data: [], error: null })

    const wrapper = mountComponent([makeSuggestion('sibling', MATCHED_PERSON)])
    await flushPromises()

    const linkBtn = wrapper.find('button.btn-primary')
    await linkBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Cannot link sibling — add parents first.')
  })
})

describe('RelationshipSuggestions — rendering', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows fallback text when suggestions list is empty', async () => {
    const wrapper = mountComponent([])
    await flushPromises()
    expect(wrapper.text()).toContain('No relationship suggestions')
  })

  it('renders a badge for each suggestion type', async () => {
    const suggestions: RelationshipSuggestion[] = [
      makeSuggestion('parent'),
      makeSuggestion('child'),
      makeSuggestion('spouse'),
      makeSuggestion('sibling'),
    ]
    const wrapper = mountComponent(suggestions)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Parent')
    expect(text).toContain('Child')
    expect(text).toContain('Spouse')
    expect(text).toContain('Sibling')
  })

  it('marks suggestion as linked after successful link', async () => {
    const parentChildChain = mockFrom('parent_child') as { insert: ReturnType<typeof vi.fn> }
    parentChildChain.insert.mockResolvedValueOnce({ error: null })

    const wrapper = mountComponent([makeSuggestion('parent', MATCHED_PERSON)])
    await flushPromises()

    await wrapper.find('button.btn-primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Linked Mary')
  })

  it('marks suggestion as skipped when Skip is clicked', async () => {
    const wrapper = mountComponent([makeSuggestion('parent', MATCHED_PERSON)])
    await flushPromises()

    await wrapper.find('button.btn-ghost').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Skipped')
  })
})
