import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockOrderFn = vi.fn()
const mockOrFn = vi.fn()

// Each call to supabase.from() returns a fresh chainable object
// that routes to different terminal methods depending on the table
vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn((...args) => mockOrFn(...args)),
      order: vi.fn((...args) => mockOrderFn(...args)),
      single: vi.fn((...args) => mockSingle(...args)),
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
    // person fetch terminates at .single()
    mockSingle.mockResolvedValueOnce({ data: PERSON_ROW, error: null })
    // all other fetches terminate at .order()
    mockOrderFn.mockResolvedValue({ data: [], error: null })
    // marriages terminate at .or()
    mockOrFn.mockResolvedValue({ data: [], error: null })

    const detail = usePersonDetail('p1')
    await detail.load()

    expect(detail.person.value?.firstName).toBe('John')
    expect(detail.person.value?.lastName).toBe('Doe')
    expect(detail.residences.value).toEqual([])
    expect(detail.education.value).toEqual([])
    expect(detail.occupations.value).toEqual([])
    expect(detail.militaryService.value).toEqual([])
    expect(detail.parents.value).toEqual([])
    expect(detail.children.value).toEqual([])
    expect(detail.spouses.value).toEqual([])
    expect(detail.isLoading.value).toBe(false)
    expect(detail.error.value).toBeNull()
  })

  it('load sets error and rethrows when person fetch fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    mockOrderFn.mockResolvedValue({ data: [], error: null })
    mockOrFn.mockResolvedValue({ data: [], error: null })

    const detail = usePersonDetail('bad-id')
    await expect(detail.load()).rejects.toThrow('not found')
    expect(detail.error.value).toBe('not found')
    expect(detail.isLoading.value).toBe(false)
  })
})
