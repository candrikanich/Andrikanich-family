import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockStorageUpload, mockStorageRemove, mockStorageSignedUrls, mockStorageFrom, mockChain, mockFrom } = vi.hoisted(() => {
  const mockChain = {
    select:   vi.fn().mockReturnThis(),
    insert:   vi.fn().mockReturnThis(),
    update:   vi.fn().mockReturnThis(),
    delete:   vi.fn().mockReturnThis(),
    eq:       vi.fn().mockReturnThis(),
    order:    vi.fn().mockResolvedValue({ data: [], error: null }),
    single:   vi.fn(),
  }
  const mockFrom = vi.fn(() => mockChain)
  const mockStorageUpload       = vi.fn()
  const mockStorageRemove       = vi.fn()
  const mockStorageSignedUrls   = vi.fn()
  const mockStorageFrom         = vi.fn(() => ({
    upload:          mockStorageUpload,
    remove:          mockStorageRemove,
    createSignedUrls: mockStorageSignedUrls,
  }))
  return { mockStorageUpload, mockStorageRemove, mockStorageSignedUrls, mockStorageFrom, mockChain, mockFrom }
})

vi.mock('@/services/supabase', () => ({
  supabase: {
    from:    mockFrom,
    storage: { from: mockStorageFrom },
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({ profile: { id: 'user-1' } })),
}))

import { useMedia } from '@/composables/useMedia'

const MEDIA_ROW = {
  id: 'photo-1', person_id: 'person-1', storage_path: 'person-1/photo-1.jpg',
  caption: 'Wedding', year_approx: 1950, uploaded_by: 'user-1', uploaded_at: '2026-01-01T00:00:00Z',
}

describe('useMedia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load fetches photos and resolves signed URLs', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [MEDIA_ROW], error: null })
    mockStorageSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'person-1/photo-1.jpg', signedUrl: 'https://cdn.example.com/photo-1.jpg' }],
      error: null,
    })

    const media = useMedia('person-1')
    await media.load()

    expect(media.photos.value).toHaveLength(1)
    expect(media.photos.value[0].id).toBe('photo-1')
    expect(media.urls.value['person-1/photo-1.jpg']).toBe('https://cdn.example.com/photo-1.jpg')
    expect(media.isLoading.value).toBe(false)
  })

  it('load resets urls when photos list becomes empty', async () => {
    // First load: one photo
    mockChain.order.mockResolvedValueOnce({ data: [MEDIA_ROW], error: null })
    mockStorageSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'person-1/photo-1.jpg', signedUrl: 'https://cdn.example.com/photo-1.jpg' }],
      error: null,
    })
    const media = useMedia('person-1')
    await media.load()
    expect(media.urls.value['person-1/photo-1.jpg']).toBe('https://cdn.example.com/photo-1.jpg')

    // Second load: no photos — urls should be cleared
    mockChain.order.mockResolvedValueOnce({ data: [], error: null })
    await media.load()
    expect(media.photos.value).toHaveLength(0)
    expect(media.urls.value).toEqual({})
  })

  it('load sets error when db fetch fails', async () => {
    mockChain.order.mockResolvedValueOnce({ data: null, error: { message: 'db error' } })

    const media = useMedia('person-1')
    await expect(media.load()).rejects.toThrow('db error')
    expect(media.error.value).toBe('db error')
    expect(media.isLoading.value).toBe(false)
  })

  it('upload stores file, inserts row, and reloads', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: null })
    mockChain.single.mockResolvedValueOnce({ data: MEDIA_ROW, error: null })
    // reload
    mockChain.order.mockResolvedValueOnce({ data: [MEDIA_ROW], error: null })
    mockStorageSignedUrls.mockResolvedValueOnce({
      data: [{ path: 'person-1/photo-1.jpg', signedUrl: 'https://cdn.example.com/photo-1.jpg' }],
      error: null,
    })

    const media = useMedia('person-1')
    const file = new File(['data'], 'photo-1.jpg', { type: 'image/jpeg' })
    await media.upload(file, 'Wedding', 1950)

    expect(mockStorageUpload).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith('media')
    expect(media.photos.value).toHaveLength(1)
  })

  it('upload rolls back storage file on DB insert failure', async () => {
    mockStorageUpload.mockResolvedValueOnce({ error: null })
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } })
    mockStorageRemove.mockResolvedValueOnce({ error: null })

    const media = useMedia('person-1')
    const file = new File(['data'], 'photo-1.jpg', { type: 'image/jpeg' })
    await expect(media.upload(file)).rejects.toThrow('insert failed')

    expect(mockStorageRemove).toHaveBeenCalledWith([expect.stringContaining('person-1/')])
    expect(media.uploading.value).toBe(false)
  })

  it('remove deletes from storage and db then reloads', async () => {
    mockStorageRemove.mockResolvedValueOnce({ error: null })
    mockChain.eq.mockResolvedValueOnce({ error: null })
    // reload inside remove
    mockChain.order.mockResolvedValueOnce({ data: [], error: null })

    const media = useMedia('person-1')
    const photo = {
      id: 'photo-1', personId: 'person-1', storagePath: 'person-1/photo-1.jpg',
      caption: null, yearApprox: null, uploadedBy: null, uploadedAt: '',
    }
    await media.remove(photo)

    expect(mockStorageRemove).toHaveBeenCalledWith(['person-1/photo-1.jpg'])
    expect(media.photos.value).toHaveLength(0)
    expect(media.isLoading.value).toBe(false)
  })

  it('setPrimary updates people.primary_photo_id', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null })

    const media = useMedia('person-1')
    await media.setPrimary('photo-1')

    expect(mockFrom).toHaveBeenCalledWith('people')
    expect(mockChain.update).toHaveBeenCalledWith({ primary_photo_id: 'photo-1' })
  })
})
