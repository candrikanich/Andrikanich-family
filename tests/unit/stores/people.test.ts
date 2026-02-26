import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { mockChain, mockFrom } = vi.hoisted(() => {
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
  return { mockChain, mockFrom }
})

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

  it('fetchPeople applies name query filter', async () => {
    mockChain.or.mockResolvedValueOnce({ data: [PERSON_ROW], error: null })
    const store = usePeopleStore()
    await store.fetchPeople({ query: 'John' })
    expect(store.list).toEqual([PERSON])
    expect(mockChain.or).toHaveBeenCalledWith(expect.stringContaining('first_name.ilike.%John%'))
  })

  it('fetchPeople applies birth year range filter', async () => {
    mockChain.lte.mockResolvedValueOnce({ data: [PERSON_ROW], error: null })
    const store = usePeopleStore()
    await store.fetchPeople({ birthYearMin: 1900, birthYearMax: 1950 })
    expect(store.list).toEqual([PERSON])
    expect(mockChain.gte).toHaveBeenCalledWith('birth_date', '1900-01-01')
    expect(mockChain.lte).toHaveBeenCalledWith('birth_date', '1950-12-31')
  })

  it('sanitizeFilter strips commas and parentheses from user input', async () => {
    mockChain.or.mockResolvedValueOnce({ data: [], error: null })
    const store = usePeopleStore()
    await store.fetchPeople({ query: 'Smith, Jr' })
    const orCall = (mockChain.or as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(orCall).not.toContain('Smith, Jr')
    expect(orCall).toContain('Smith')
  })
})
