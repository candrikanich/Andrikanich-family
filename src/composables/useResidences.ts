import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Residence } from '@/types'
import type { Database } from '@/types/database'

type ResidenceRow = Database['public']['Tables']['residences']['Row']

function mapResidence(row: ResidenceRow): Residence {
  return {
    id: row.id, personId: row.person_id, location: row.location,
    fromDate: row.from_date, toDate: row.to_date, isCurrent: row.is_current, sortOrder: row.sort_order,
  }
}

export interface ResidenceInput {
  location: string
  fromDate?: string | null
  toDate?: string | null
  isCurrent?: boolean
  sortOrder?: number
}

export function useResidences(personId: string) {
  const items     = ref<Residence[]>([])
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function fetch() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('residences').select('*').eq('person_id', personId).order('sort_order', { ascending: true })
      if (err) throw err
      items.value = (data ?? []).map(mapResidence)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
    } finally {
      isLoading.value = false
    }
  }

  async function add(input: ResidenceInput): Promise<Residence> {
    isLoading.value = true
    error.value = null
    try {
      const maxOrder = items.value.reduce((m, r) => Math.max(m, r.sortOrder), 0)
      const { data, error: err } = await supabase
        .from('residences')
        .insert({
          person_id: personId, location: input.location,
          from_date: input.fromDate ?? null, to_date: input.toDate ?? null,
          is_current: input.isCurrent ?? false,
          sort_order: input.sortOrder ?? maxOrder + 1,
        })
        .select().single()
      if (err) throw err
      if (!data) throw new Error('No data returned from database')
      const residence = mapResidence(data)
      items.value = [...items.value, residence]
      return residence
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function update(id: string, input: Partial<ResidenceInput>): Promise<Residence> {
    isLoading.value = true
    error.value = null
    try {
      const patch: Record<string, unknown> = {}
      if (input.location  !== undefined) patch['location']   = input.location
      if (input.fromDate  !== undefined) patch['from_date']  = input.fromDate
      if (input.toDate    !== undefined) patch['to_date']    = input.toDate
      if (input.isCurrent !== undefined) patch['is_current'] = input.isCurrent
      if (input.sortOrder !== undefined) patch['sort_order'] = input.sortOrder

      const { data, error: err } = await supabase
        .from('residences').update(patch).eq('id', id).select().single()
      if (err) throw err
      if (!data) throw new Error('No data returned from database')
      const residence = mapResidence(data)
      items.value = items.value.map(r => r.id === id ? residence : r)
      return residence
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function remove(id: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const { error: err } = await supabase.from('residences').delete().eq('id', id)
      if (err) throw err
      items.value = items.value.filter(r => r.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return { items, isLoading, error, fetch, add, update, remove }
}
