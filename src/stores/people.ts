import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { Person, PersonInput, PeopleSearchParams } from '@/types'
import type { Database } from '@/types/database'

type PersonRow = Database['public']['Tables']['people']['Row']

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthSurname: row.birth_surname,
    nickname: row.nickname,
    nameVariants: row.name_variants,
    suffix: row.suffix,
    birthDate: row.birth_date,
    birthPlace: row.birth_place,
    deathDate: row.death_date,
    deathPlace: row.death_place,
    burialPlace: row.burial_place,
    notes: row.notes,
    biography: row.biography,
    primaryPhotoId: row.primary_photo_id,
    userId: row.user_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const usePeopleStore = defineStore('people', () => {
  const list = ref<Person[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPeople(params?: PeopleSearchParams) {
    isLoading.value = true
    error.value = null
    try {
      let query = supabase.from('people').select('*').order('last_name', { ascending: true })

      if (params?.query) {
        const q = `%${params.query}%`
        query = query.or(`first_name.ilike.${q},last_name.ilike.${q},birth_surname.ilike.${q},nickname.ilike.${q}`)
      }
      if (params?.birthYearMin) {
        query = query.gte('birth_date', `${params.birthYearMin}-01-01`)
      }
      if (params?.birthYearMax) {
        query = query.lte('birth_date', `${params.birthYearMax}-12-31`)
      }
      if (params?.location) {
        const loc = `%${params.location}%`
        query = query.or(`birth_place.ilike.${loc},death_place.ilike.${loc}`)
      }

      const { data, error: dbError } = await query
      if (dbError) throw dbError
      list.value = (data ?? []).map(mapPerson)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createPerson(input: PersonInput): Promise<Person> {
    const { data, error: dbError } = await supabase
      .from('people')
      .insert({
        first_name: input.firstName,
        last_name: input.lastName,
        birth_surname: input.birthSurname ?? null,
        nickname: input.nickname ?? null,
        name_variants: input.nameVariants ?? [],
        suffix: input.suffix ?? null,
        birth_date: input.birthDate ?? null,
        birth_place: input.birthPlace ?? null,
        death_date: input.deathDate ?? null,
        death_place: input.deathPlace ?? null,
        burial_place: input.burialPlace ?? null,
        notes: input.notes ?? null,
        biography: input.biography ?? null,
      })
      .select()
      .single()

    if (dbError) throw dbError
    const person = mapPerson(data)
    list.value = [...list.value, person]
    return person
  }

  async function updatePerson(id: string, input: Partial<PersonInput>): Promise<Person> {
    const patch: Record<string, unknown> = {}
    if (input.firstName !== undefined)    patch.first_name    = input.firstName
    if (input.lastName !== undefined)     patch.last_name     = input.lastName
    if (input.birthSurname !== undefined) patch.birth_surname = input.birthSurname
    if (input.nickname !== undefined)     patch.nickname      = input.nickname
    if (input.nameVariants !== undefined) patch.name_variants = input.nameVariants
    if (input.suffix !== undefined)       patch.suffix        = input.suffix
    if (input.birthDate !== undefined)    patch.birth_date    = input.birthDate
    if (input.birthPlace !== undefined)   patch.birth_place   = input.birthPlace
    if (input.deathDate !== undefined)    patch.death_date    = input.deathDate
    if (input.deathPlace !== undefined)   patch.death_place   = input.deathPlace
    if (input.burialPlace !== undefined)  patch.burial_place  = input.burialPlace
    if (input.notes !== undefined)        patch.notes         = input.notes
    if (input.biography !== undefined)    patch.biography     = input.biography

    const { data, error: dbError } = await supabase
      .from('people')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (dbError) throw dbError
    const person = mapPerson(data)
    list.value = list.value.map(p => p.id === id ? person : p)
    return person
  }

  async function deletePerson(id: string): Promise<void> {
    const { error: dbError } = await supabase.from('people').delete().eq('id', id)
    if (dbError) throw dbError
    list.value = list.value.filter(p => p.id !== id)
  }

  return { list, isLoading, error, fetchPeople, createPerson, updatePerson, deletePerson }
})
