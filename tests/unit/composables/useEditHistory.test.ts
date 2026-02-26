import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockChain, mockFrom } = vi.hoisted(() => {
  const mockChain = {
    select:  vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    limit:   vi.fn().mockResolvedValue({ data: [], error: null }),
    single:  vi.fn(),
  }
  const mockFrom = vi.fn(() => mockChain)
  return { mockChain, mockFrom }
})

vi.mock('@/services/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { useEditHistory } from '@/composables/useEditHistory'

const HISTORY_ROW = {
  id: 'h1', table_name: 'people', record_id: 'p1',
  field_name: 'biography', old_value: '"old bio"', new_value: '"new bio"',
  changed_by: 'user-1', changed_at: '2026-01-01T00:00:00Z',
}

describe('useEditHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load fetches history entries for a person', async () => {
    mockChain.limit.mockResolvedValueOnce({ data: [HISTORY_ROW], error: null })

    const eh = useEditHistory('p1')
    await eh.load()

    expect(eh.entries.value).toHaveLength(1)
    expect(eh.entries.value[0].fieldName).toBe('biography')
    expect(eh.entries.value[0].tableName).toBe('people')
    expect(eh.isLoading.value).toBe(false)
  })

  it('load sets error on db failure', async () => {
    mockChain.limit.mockResolvedValueOnce({ data: null, error: { message: 'access denied' } })

    const eh = useEditHistory('p1')
    await expect(eh.load()).rejects.toThrow('access denied')
    expect(eh.error.value).toBe('access denied')
  })

  it('restore updates the record and reloads', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null })
    mockChain.limit.mockResolvedValueOnce({ data: [], error: null })

    const eh = useEditHistory('p1')
    await eh.restore({
      id: 'h1', tableName: 'people', recordId: 'p1',
      fieldName: 'biography', oldValue: 'old bio', newValue: 'new bio',
      changedBy: 'user-1', changedAt: '2026-01-01T00:00:00Z',
    })

    expect(mockFrom).toHaveBeenCalledWith('people')
    expect(mockFrom).toHaveBeenCalledWith('edit_history')
  })

  it('restore sets error when update fails', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: { message: 'update failed' } })

    const eh = useEditHistory('p1')
    await expect(eh.restore({
      id: 'h1', tableName: 'people', recordId: 'p1',
      fieldName: 'biography', oldValue: 'old bio', newValue: 'new bio',
      changedBy: 'user-1', changedAt: '2026-01-01T00:00:00Z',
    })).rejects.toThrow('update failed')
    expect(eh.error.value).toBe('update failed')
  })

  it('restore throws when oldValue is null (_created entry)', async () => {
    const eh = useEditHistory('p1')
    await expect(eh.restore({
      id: 'h1', tableName: 'people', recordId: 'p1',
      fieldName: '_created', oldValue: null, newValue: {},
      changedBy: null, changedAt: '2026-01-01T00:00:00Z',
    })).rejects.toThrow('Cannot restore a record creation entry')
  })
})
