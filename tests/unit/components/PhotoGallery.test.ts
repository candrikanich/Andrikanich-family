import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockLoad    = vi.fn().mockResolvedValue(undefined)
const mockUpload  = vi.fn().mockResolvedValue(undefined)
const mockRemove  = vi.fn().mockResolvedValue(undefined)
const mockSetPrimary = vi.fn().mockResolvedValue(undefined)
const mockPhotos  = vi.fn(() => [])
const mockUrls    = vi.fn(() => ({}))
const mockError   = vi.fn(() => null)
const mockUploading = vi.fn(() => false)
const mockIsLoading = vi.fn(() => false)

vi.mock('@/composables/useMedia', () => ({
  useMedia: vi.fn(() => ({
    photos:    { value: mockPhotos() },
    urls:      { value: mockUrls() },
    error:     { value: mockError() },
    uploading: { value: mockUploading() },
    isLoading: { value: mockIsLoading() },
    load:      mockLoad,
    upload:    mockUpload,
    remove:    mockRemove,
    setPrimary: mockSetPrimary,
  })),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({ isEditor: true })),
}))

import PhotoGallery from '@/components/PhotoGallery.vue'

const PHOTO = {
  id: 'photo-1', personId: 'p1', storagePath: 'p1/photo-1.jpg',
  caption: 'Wedding', yearApprox: 1950, uploadedBy: null, uploadedAt: '',
}

describe('PhotoGallery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('calls load on mount', () => {
    mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: null } })
    expect(mockLoad).toHaveBeenCalledOnce()
  })

  it('renders empty state when no photos', () => {
    const wrapper = mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: null } })
    expect(wrapper.text()).toContain('No photos yet')
  })

  it('renders photo thumbnails', () => {
    mockPhotos.mockReturnValueOnce([PHOTO])
    mockUrls.mockReturnValueOnce({ 'p1/photo-1.jpg': 'https://cdn.example.com/photo-1.jpg' })

    const wrapper = mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: null } })
    expect(wrapper.find('img').attributes('src')).toBe('https://cdn.example.com/photo-1.jpg')
  })

  it('shows Set as primary button when photo is not primary', () => {
    mockPhotos.mockReturnValueOnce([PHOTO])
    mockUrls.mockReturnValueOnce({ 'p1/photo-1.jpg': 'https://cdn.example.com/photo-1.jpg' })

    const wrapper = mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: null } })
    expect(wrapper.text()).toContain('Set as primary')
  })

  it('does not show Set as primary when photo is already primary', () => {
    mockPhotos.mockReturnValueOnce([PHOTO])
    mockUrls.mockReturnValueOnce({ 'p1/photo-1.jpg': 'https://cdn.example.com/photo-1.jpg' })

    const wrapper = mount(PhotoGallery, { props: { personId: 'p1', primaryPhotoId: 'photo-1' } })
    expect(wrapper.text()).not.toContain('Set as primary')
  })
})
