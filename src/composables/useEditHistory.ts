import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { EditHistoryEntry } from '@/types'
import type { Database } from '@/types/database'

type HistoryRow = Database['public']['Tables']['edit_history']['Row']

function mapEntry(row: HistoryRow): EditHistoryEntry {
  return {
    id: row.id,
    tableName: row.table_name,
    recordId: row.record_id,
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }
}

export function useEditHistory(personId: string) {
  const entries   = ref<EditHistoryEntry[]>([])
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function load(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: dbError } = await supabase
        .from('edit_history')
        .select('*')
        .eq('record_id', personId)
        .eq('table_name', 'people')
        .order('changed_at', { ascending: false })
        .limit(50)
      if (dbError) throw dbError
      entries.value = (data ?? []).map(mapEntry)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function restore(entry: EditHistoryEntry): Promise<void> {
    if (entry.oldValue === null) {
      throw new Error('Cannot restore a record creation entry — no previous value exists.')
    }
    error.value = null
    try {
      // Cast required: Supabase typed client does not accept a dynamic table name.
      // Runtime behaviour is correct — entry.tableName comes from the DB trigger,
      // so it will always be a valid table name for the originating table.
      const { error: dbError } = await supabase
        .from(entry.tableName as 'people')
        .update({ [entry.fieldName]: entry.oldValue })
        .eq('id', entry.recordId)
      if (dbError) throw dbError
      await load()
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  return { entries, isLoading, error, load, restore }
}
