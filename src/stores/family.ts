import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import type { FamilyMember, EditHistoryEntry, FamilyDocument } from '@/types'

export const useFamilyStore = defineStore('family', () => {
  const members = ref<FamilyMember[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const searchQuery = ref('')

  // Computed
  const filteredMembers = computed(() => {
    if (!searchQuery.value) return members.value
    const query = searchQuery.value.toLowerCase()
    return members.value.filter(m =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(query) ||
      m.bio?.toLowerCase().includes(query)
    )
  })

  // Fetch all family members
  async function fetchMembers() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: fetchError } = await supabase
        .from('family_members')
        .select('*')
        .order('last_name', { ascending: true })

      if (fetchError) throw fetchError
      members.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch members'
    } finally {
      isLoading.value = false
    }
  }

  // Get single member
  async function getMember(id: string): Promise<FamilyMember | null> {
    try {
      const { data, error: fetchError } = await supabase
        .from('family_members')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError
      return data
    } catch (err) {
      console.error('Failed to fetch member:', err)
      return null
    }
  }

  // Create member
  async function createMember(
    firstName: string,
    lastName: string,
    userId: string,
    payload: Partial<FamilyMember> = {}
  ) {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: createError } = await supabase
        .from('family_members')
        .insert({
          first_name: firstName,
          last_name: lastName,
          created_by: userId,
          last_modified_by: userId,
          ...payload
        })
        .select()
        .single()

      if (createError) throw createError
      if (data) members.value.push(data)
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create member'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Update member
  async function updateMember(id: string, updates: Partial<FamilyMember>, userId: string) {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: updateError } = await supabase
        .from('family_members')
        .update({
          ...updates,
          last_modified_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      // Update local state
      const index = members.value.findIndex(m => m.id === id)
      if (index !== -1) {
        members.value[index] = data
      }

      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update member'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Delete member
  async function deleteMember(id: string) {
    isLoading.value = true
    error.value = null
    try {
      const { error: deleteError } = await supabase
        .from('family_members')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      members.value = members.value.filter(m => m.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete member'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Get edit history for a member
  async function getEditHistory(memberId: string): Promise<EditHistoryEntry[]> {
    try {
      const { data, error: fetchError } = await supabase
        .from('edit_history')
        .select('*')
        .eq('member_id', memberId)
        .order('changed_at', { ascending: false })

      if (fetchError) throw fetchError
      return data || []
    } catch (err) {
      console.error('Failed to fetch edit history:', err)
      return []
    }
  }

  // Get documents for a member
  async function getDocuments(memberId: string): Promise<FamilyDocument[]> {
    try {
      const { data, error: fetchError } = await supabase
        .from('family_documents')
        .select('*')
        .eq('member_id', memberId)
        .order('uploaded_at', { ascending: false })

      if (fetchError) throw fetchError
      return data || []
    } catch (err) {
      console.error('Failed to fetch documents:', err)
      return []
    }
  }

  return {
    members,
    filteredMembers,
    isLoading,
    error,
    searchQuery,
    fetchMembers,
    getMember,
    createMember,
    updateMember,
    deleteMember,
    getEditHistory,
    getDocuments
  }
})
