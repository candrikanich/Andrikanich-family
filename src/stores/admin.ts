import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Profile } from '@/types'

export const useAdminStore = defineStore('admin', () => {
  const pendingProfiles = ref<Profile[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

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

  async function fetchPending() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (fetchError) throw fetchError
      pendingProfiles.value = (data ?? []).map(mapProfile)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load pending users'
    } finally {
      isLoading.value = false
    }
  }

  async function approve(profileId: string) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ status: 'approved' })
      .eq('id', profileId)
    if (updateError) throw updateError
    pendingProfiles.value = pendingProfiles.value.filter(p => p.id !== profileId)
  }

  async function deny(profileId: string) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ status: 'denied' })
      .eq('id', profileId)
    if (updateError) throw updateError
    pendingProfiles.value = pendingProfiles.value.filter(p => p.id !== profileId)
  }

  return { pendingProfiles, isLoading, error, fetchPending, approve, deny }
})
