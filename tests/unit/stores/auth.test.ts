import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock supabase before importing the store
vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}))

import { useAuthStore } from '@/stores/auth'

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initialises with null profile and unauthenticated state', () => {
    const store = useAuthStore()
    expect(store.profile).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('isPending returns true when status is pending', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'viewer', status: 'pending', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.isPending).toBe(true)
    expect(store.isApproved).toBe(false)
  })

  it('isApproved returns true when status is approved', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'viewer', status: 'approved', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.isApproved).toBe(true)
    expect(store.isPending).toBe(false)
  })

  it('isAdmin returns true only for admin role with approved status', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'admin', status: 'approved', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.isAdmin).toBe(true)
    expect(store.isEditor).toBe(true)
  })

  it('isEditor returns false for viewer role', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'viewer', status: 'approved', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.isEditor).toBe(false)
    expect(store.isAdmin).toBe(false)
  })

  it('needsOnboarding is true when approved but personId is null', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'viewer', status: 'approved', personId: null,
      createdAt: '', updatedAt: ''
    }
    expect(store.needsOnboarding).toBe(true)
  })

  it('needsOnboarding is false when personId is set', () => {
    const store = useAuthStore()
    store.profile = {
      id: '1', email: 'a@b.com', firstName: 'A', lastName: 'B',
      role: 'viewer', status: 'approved', personId: 'some-uuid',
      createdAt: '', updatedAt: ''
    }
    expect(store.needsOnboarding).toBe(false)
  })
})
