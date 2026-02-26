import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type {
  Person, PersonSummary, Residence, Education, Occupation,
  MilitaryService, ParentChild, Marriage,
} from '@/types'
import type { Database } from '@/types/database'

type PersonRow     = Database['public']['Tables']['people']['Row']
type ResidenceRow  = Database['public']['Tables']['residences']['Row']
type EducationRow  = Database['public']['Tables']['education']['Row']
type OccupationRow = Database['public']['Tables']['occupations']['Row']
type MilitaryRow   = Database['public']['Tables']['military_service']['Row']

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

function mapPersonSummary(row: PersonRow): PersonSummary {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthSurname: row.birth_surname,
    nickname: row.nickname,
    birthDate: row.birth_date,
    deathDate: row.death_date,
    primaryPhotoId: row.primary_photo_id,
  }
}

function mapResidence(row: ResidenceRow): Residence {
  return {
    id: row.id,
    personId: row.person_id,
    location: row.location,
    fromDate: row.from_date,
    toDate: row.to_date,
    isCurrent: row.is_current,
    sortOrder: row.sort_order,
  }
}

function mapEducation(row: EducationRow): Education {
  return {
    id: row.id,
    personId: row.person_id,
    institution: row.institution,
    institutionType: row.institution_type,
    location: row.location,
    startYear: row.start_year,
    endYear: row.end_year,
    graduated: row.graduated,
    notes: row.notes,
  }
}

function mapOccupation(row: OccupationRow): Occupation {
  return {
    id: row.id,
    personId: row.person_id,
    employer: row.employer,
    title: row.title,
    fromDate: row.from_date,
    toDate: row.to_date,
    isCurrent: row.is_current,
  }
}

function mapMilitary(row: MilitaryRow): MilitaryService {
  return {
    id: row.id,
    personId: row.person_id,
    branch: row.branch,
    rank: row.rank,
    fromDate: row.from_date,
    toDate: row.to_date,
    notes: row.notes,
  }
}

export interface RelatedParent { person: PersonSummary; relationship: ParentChild }
export interface RelatedChild  { person: PersonSummary; relationship: ParentChild }
export interface RelatedSpouse { person: PersonSummary; marriage: Marriage }

export function usePersonDetail(personId: string) {
  const person          = ref<Person | null>(null)
  const residences      = ref<Residence[]>([])
  const education       = ref<Education[]>([])
  const occupations     = ref<Occupation[]>([])
  const militaryService = ref<MilitaryService[]>([])
  const parents         = ref<RelatedParent[]>([])
  const children        = ref<RelatedChild[]>([])
  const spouses         = ref<RelatedSpouse[]>([])
  const isLoading       = ref(false)
  const error           = ref<string | null>(null)

  async function load(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const [
        personRes, residencesRes, educationRes, occupationsRes, militaryRes,
        parentsRes, childrenRes, marriagesRes,
      ] = await Promise.all([
        supabase.from('people').select('*').eq('id', personId).single(),
        supabase.from('residences').select('*').eq('person_id', personId).order('sort_order', { ascending: true }),
        supabase.from('education').select('*').eq('person_id', personId).order('start_year', { ascending: true }),
        supabase.from('occupations').select('*').eq('person_id', personId).order('from_date', { ascending: true }),
        supabase.from('military_service').select('*').eq('person_id', personId).order('from_date', { ascending: true }),
        supabase.from('parent_child').select('*, parent:parent_id(*)').eq('child_id', personId).order('created_at', { ascending: true }),
        supabase.from('parent_child').select('*, child:child_id(*)').eq('parent_id', personId).order('created_at', { ascending: true }),
        supabase.from('marriages').select('*, person_a:person_a_id(*), person_b:person_b_id(*)').or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`),
      ])

      if (personRes.error) throw personRes.error
      if (residencesRes.error) throw residencesRes.error
      if (educationRes.error) throw educationRes.error
      if (occupationsRes.error) throw occupationsRes.error
      if (militaryRes.error) throw militaryRes.error
      if (parentsRes.error) throw parentsRes.error
      if (childrenRes.error) throw childrenRes.error
      if (marriagesRes.error) throw marriagesRes.error

      person.value          = mapPerson(personRes.data)
      residences.value      = (residencesRes.data ?? []).map(mapResidence)
      education.value       = (educationRes.data ?? []).map(mapEducation)
      occupations.value     = (occupationsRes.data ?? []).map(mapOccupation)
      militaryService.value = (militaryRes.data ?? []).map(mapMilitary)

      parents.value = (parentsRes.data ?? [])
        .filter((row: Record<string, unknown>) => row['parent'] != null)
        .map((row: Record<string, unknown>) => ({
          person: mapPersonSummary(row['parent'] as PersonRow),
          relationship: {
            id: row['id'] as string,
            parentId: row['parent_id'] as string,
            childId: row['child_id'] as string,
            relationshipType: row['relationship_type'] as ParentChild['relationshipType'],
            confirmed: row['confirmed'] as boolean,
            createdAt: row['created_at'] as string,
          },
        }))

      children.value = (childrenRes.data ?? [])
        .filter((row: Record<string, unknown>) => row['child'] != null)
        .map((row: Record<string, unknown>) => ({
          person: mapPersonSummary(row['child'] as PersonRow),
          relationship: {
            id: row['id'] as string,
            parentId: row['parent_id'] as string,
            childId: row['child_id'] as string,
            relationshipType: row['relationship_type'] as ParentChild['relationshipType'],
            confirmed: row['confirmed'] as boolean,
            createdAt: row['created_at'] as string,
          },
        }))

      spouses.value = (marriagesRes.data ?? [])
        .filter((row: Record<string, unknown>) => row['person_a'] != null && row['person_b'] != null)
        .map((row: Record<string, unknown>) => {
          const spouseRow = (row['person_a_id'] as string) === personId
            ? row['person_b'] as PersonRow
            : row['person_a'] as PersonRow
          return {
            person: mapPersonSummary(spouseRow),
            marriage: {
              id: row['id'] as string,
              personAId: row['person_a_id'] as string,
              personBId: row['person_b_id'] as string,
              marriageDate: row['marriage_date'] as string | null,
              marriagePlace: row['marriage_place'] as string | null,
              endDate: row['end_date'] as string | null,
              endReason: row['end_reason'] as Marriage['endReason'],
              createdAt: row['created_at'] as string,
            },
          }
        })
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : (err as { message?: string }).message ?? String(err)
      error.value = message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    person, residences, education, occupations, militaryService,
    parents, children, spouses, isLoading, error, load,
  }
}
