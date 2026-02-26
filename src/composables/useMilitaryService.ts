import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { MilitaryService } from '@/types'
import type { Database } from '@/types/database'

type MilitaryRow = Database['public']['Tables']['military_service']['Row']

function mapMilitary(row: MilitaryRow): MilitaryService {
  return {
    id: row.id, personId: row.person_id, branch: row.branch, rank: row.rank,
    fromDate: row.from_date, toDate: row.to_date, notes: row.notes,
  }
}

export interface MilitaryServiceInput {
  branch?: string | null
  rank?: string | null
  fromDate?: string | null
  toDate?: string | null
  notes?: string | null
}

export function useMilitaryService(personId: string) {
  const items     = ref<MilitaryService[]>([])
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function fetch() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('military_service').select('*').eq('person_id', personId).order('from_date', { ascending: true })
      if (err) throw err
      items.value = (data ?? []).map(mapMilitary)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
    } finally {
      isLoading.value = false
    }
  }

  async function add(input: MilitaryServiceInput): Promise<MilitaryService> {
    const { data, error: err } = await supabase
      .from('military_service')
      .insert({
        person_id: personId,
        branch: input.branch ?? null,
        rank: input.rank ?? null,
        from_date: input.fromDate ?? null,
        to_date: input.toDate ?? null,
        notes: input.notes ?? null,
      })
      .select().single()
    if (err) throw err
    const service = mapMilitary(data)
    items.value = [...items.value, service]
    return service
  }

  async function update(id: string, input: Partial<MilitaryServiceInput>): Promise<MilitaryService> {
    const patch: Record<string, unknown> = {}
    if (input.branch   !== undefined) patch['branch']    = input.branch
    if (input.rank     !== undefined) patch['rank']      = input.rank
    if (input.fromDate !== undefined) patch['from_date'] = input.fromDate
    if (input.toDate   !== undefined) patch['to_date']   = input.toDate
    if (input.notes    !== undefined) patch['notes']     = input.notes

    const { data, error: err } = await supabase
      .from('military_service').update(patch).eq('id', id).select().single()
    if (err) throw err
    const service = mapMilitary(data)
    items.value = items.value.map(s => s.id === id ? service : s)
    return service
  }

  async function remove(id: string): Promise<void> {
    const { error: err } = await supabase.from('military_service').delete().eq('id', id)
    if (err) throw err
    items.value = items.value.filter(s => s.id !== id)
  }

  return { items, isLoading, error, fetch, add, update, remove }
}
