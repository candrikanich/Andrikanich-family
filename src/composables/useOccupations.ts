import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Occupation } from '@/types'
import type { Database } from '@/types/database'

type OccupationRow = Database['public']['Tables']['occupations']['Row']

function mapOccupation(row: OccupationRow): Occupation {
  return {
    id: row.id, personId: row.person_id, employer: row.employer, title: row.title,
    fromDate: row.from_date, toDate: row.to_date, isCurrent: row.is_current,
  }
}

export interface OccupationInput {
  employer?: string | null
  title?: string | null
  fromDate?: string | null
  toDate?: string | null
  isCurrent?: boolean
}

export function useOccupations(personId: string) {
  const items     = ref<Occupation[]>([])
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function fetch() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('occupations').select('*').eq('person_id', personId).order('from_date', { ascending: true })
      if (err) throw err
      items.value = (data ?? []).map(mapOccupation)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
    } finally {
      isLoading.value = false
    }
  }

  async function add(input: OccupationInput): Promise<Occupation> {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('occupations')
        .insert({
          person_id: personId,
          employer: input.employer ?? null,
          title: input.title ?? null,
          from_date: input.fromDate ?? null,
          to_date: input.toDate ?? null,
          is_current: input.isCurrent ?? false,
        })
        .select().single()
      if (err) throw err
      if (!data) throw new Error('No data returned from database')
      const occupation = mapOccupation(data)
      items.value = [...items.value, occupation]
      return occupation
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function update(id: string, input: Partial<OccupationInput>): Promise<Occupation> {
    isLoading.value = true
    error.value = null
    try {
      const patch: Record<string, unknown> = {}
      if (input.employer  !== undefined) patch['employer']   = input.employer
      if (input.title     !== undefined) patch['title']      = input.title
      if (input.fromDate  !== undefined) patch['from_date']  = input.fromDate
      if (input.toDate    !== undefined) patch['to_date']    = input.toDate
      if (input.isCurrent !== undefined) patch['is_current'] = input.isCurrent

      const { data, error: err } = await supabase
        .from('occupations').update(patch).eq('id', id).select().single()
      if (err) throw err
      if (!data) throw new Error('No data returned from database')
      const occupation = mapOccupation(data)
      items.value = items.value.map(o => o.id === id ? occupation : o)
      return occupation
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
      const { error: err } = await supabase.from('occupations').delete().eq('id', id)
      if (err) throw err
      items.value = items.value.filter(o => o.id !== id)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return { items, isLoading, error, fetch, add, update, remove }
}
