import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import type { Profile } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const profile = ref<Profile | null>(null)
  const isAuthenticated = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ─── Computed ───────────────────────────────────────────────────────────────
  const isPending       = computed(() => profile.value?.status === 'pending')
  const isApproved      = computed(() => profile.value?.status === 'approved')
  const isAdmin         = computed(() => isApproved.value && profile.value?.role === 'admin')
  const isEditor        = computed(() => isApproved.value && (profile.value?.role === 'editor' || profile.value?.role === 'admin'))
  const needsOnboarding = computed(() => isApproved.value && profile.value?.personId === null)

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function mapProfile(row: {
    id: string; email: string; first_name: string; last_name: string
    role: string; status: string; person_id: string | null
    created_at: string; updated_at: string
  }): Profile {
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role as Profile['role'],
      status: row.status as Profile['status'],
      personId: row.person_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // ─── Actions ────────────────────────────────────────────────────────────────
  async function register(email: string, password: string, firstName: string, lastName: string) {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: firstName, last_name: lastName } },
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('No user returned from signup')

      // Profile is created automatically by the handle_new_user DB trigger.
      // We set local state optimistically so the UI can show the pending card.
      profile.value = {
        id: data.user.id,
        email,
        firstName,
        lastName,
        role: 'viewer',
        status: 'pending',
        personId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      isAuthenticated.value = true

      return data.user
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Registration failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function login(email: string, password: string) {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (loginError) throw loginError
      if (!data.user) throw new Error('Login failed')

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profileError) throw profileError

      profile.value = mapProfile(profileRow)
      isAuthenticated.value = true
      return profile.value
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      await supabase.auth.signOut()
    } finally {
      profile.value = null
      isAuthenticated.value = false
      error.value = null
    }
  }

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileRow) {
        profile.value = mapProfile(profileRow)
        isAuthenticated.value = true
      }
    } catch {
      // Silent fail — router guard will redirect to login
    }
  }

  async function refreshProfile() {
    if (!profile.value) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profile.value.id)
      .single()
    if (data) profile.value = mapProfile(data)
  }

  return {
    profile,
    isAuthenticated,
    isLoading,
    error,
    isPending,
    isApproved,
    isAdmin,
    isEditor,
    needsOnboarding,
    register,
    login,
    logout,
    checkAuth,
    refreshProfile,
  }
})
