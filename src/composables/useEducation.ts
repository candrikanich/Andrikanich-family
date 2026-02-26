import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Education, EducationType } from '@/types'
import type { Database } from '@/types/database'

type EducationRow = Database['public']['Tables']['education']['Row']

function mapEducation(row: EducationRow): Education {
  return {
    id: row.id, personId: row.person_id, institution: row.institution,
    institutionType: row.institution_type, location: row.location,
    startYear: row.start_year, endYear: row.end_year, graduated: row.graduated, notes: row.notes,
  }
}

export interface EducationInput {
  institution: string
  institutionType: EducationType
  location?: string | null
  startYear?: number | null
  endYear?: number | null
  graduated?: boolean | null
  notes?: string | null
}

export function useEducation(personId: string) {
  const items     = ref<Education[]>([])
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function fetch() {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('education').select('*').eq('person_id', personId).order('start_year', { ascending: true })
      if (err) throw err
      items.value = (data ?? []).map(mapEducation)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
    } finally {
      isLoading.value = false
    }
  }

  async function add(input: EducationInput): Promise<Education> {
    const { data, error: err } = await supabase
      .from('education')
      .insert({
        person_id: personId, institution: input.institution,
        institution_type: input.institutionType,
        location: input.location ?? null,
        start_year: input.startYear ?? null,
        end_year: input.endYear ?? null,
        graduated: input.graduated ?? null,
        notes: input.notes ?? null,
      })
      .select().single()
    if (err) throw err
    const education = mapEducation(data)
    items.value = [...items.value, education]
    return education
  }

  async function update(id: string, input: Partial<EducationInput>): Promise<Education> {
    const patch: Record<string, unknown> = {}
    if (input.institution     !== undefined) patch['institution']      = input.institution
    if (input.institutionType !== undefined) patch['institution_type'] = input.institutionType
    if (input.location        !== undefined) patch['location']         = input.location
    if (input.startYear       !== undefined) patch['start_year']       = input.startYear
    if (input.endYear         !== undefined) patch['end_year']         = input.endYear
    if (input.graduated       !== undefined) patch['graduated']        = input.graduated
    if (input.notes           !== undefined) patch['notes']            = input.notes

    const { data, error: err } = await supabase
      .from('education').update(patch).eq('id', id).select().single()
    if (err) throw err
    const education = mapEducation(data)
    items.value = items.value.map(e => e.id === id ? education : e)
    return education
  }

  async function remove(id: string): Promise<void> {
    const { error: err } = await supabase.from('education').delete().eq('id', id)
    if (err) throw err
    items.value = items.value.filter(e => e.id !== id)
  }

  return { items, isLoading, error, fetch, add, update, remove }
}
