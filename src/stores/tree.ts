import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { TreePerson, TreeParentChildEdge, TreeMarriageEdge, TreeSubgraph } from '@/types'
import type { Database } from '@/types/database'

type PersonRow = Database['public']['Tables']['people']['Row']
type ParentChildRow = Database['public']['Tables']['parent_child']['Row']
type MarriageRow = Database['public']['Tables']['marriages']['Row']

type ParentChildWithParent = ParentChildRow & { parent: PersonRow | null }
type ParentChildWithChild  = ParentChildRow & { child: PersonRow | null }
type MarriageWithPeople    = MarriageRow & { person_a: PersonRow | null; person_b: PersonRow | null }

function mapTreePerson(row: PersonRow): TreePerson {
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

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export const useTreeStore = defineStore('tree', () => {
  const subgraph  = ref<TreeSubgraph | null>(null)
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function fetchSubgraph(rootId: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      // ── Round 1: root + direct edges ───────────────────────────────────────
      const [rootRes, parentEdgesRes, childEdgesRes, rootMarriagesRes] = await Promise.all([
        supabase.from('people').select('*').eq('id', rootId).single(),
        supabase.from('parent_child')
          .select('*, parent:parent_id(*)')
          .eq('child_id', rootId),
        supabase.from('parent_child')
          .select('*, child:child_id(*)')
          .eq('parent_id', rootId),
        supabase.from('marriages')
          .select('*, person_a:person_a_id(*), person_b:person_b_id(*)')
          .or(`person_a_id.eq.${rootId},person_b_id.eq.${rootId}`),
      ])

      if (rootRes.error)          throw rootRes.error
      if (parentEdgesRes.error)   throw parentEdgesRes.error
      if (childEdgesRes.error)    throw childEdgesRes.error
      if (rootMarriagesRes.error) throw rootMarriagesRes.error

      const rootPerson = mapTreePerson(rootRes.data)

      const parentEdgesData   = (parentEdgesRes.data   ?? []) as unknown as ParentChildWithParent[]
      const childEdgesData    = (childEdgesRes.data    ?? []) as unknown as ParentChildWithChild[]
      const rootMarriagesData = (rootMarriagesRes.data ?? []) as unknown as MarriageWithPeople[]

      const parentEdges: TreeParentChildEdge[] = parentEdgesData.map((r) => ({
        id:        r.id,
        parentId:  r.parent_id,
        childId:   r.child_id,
        confirmed: r.confirmed,
      }))

      const childEdges: TreeParentChildEdge[] = childEdgesData.map((r) => ({
        id:        r.id,
        parentId:  r.parent_id,
        childId:   r.child_id,
        confirmed: r.confirmed,
      }))

      const parentPeople: TreePerson[] = parentEdgesData
        .filter((r) => r.parent != null)
        .map((r) => mapTreePerson(r.parent!))

      const childPeople: TreePerson[] = childEdgesData
        .filter((r) => r.child != null)
        .map((r) => mapTreePerson(r.child!))

      const rootMarriageEdges: TreeMarriageEdge[] = rootMarriagesData.map((r) => ({
        id:           r.id,
        personAId:    r.person_a_id,
        personBId:    r.person_b_id,
        marriageDate: r.marriage_date,
      }))

      const rootSpousePeople: TreePerson[] = rootMarriagesData
        .filter((r) => r.person_a != null && r.person_b != null)
        .map((r) => {
          const spouseRow = r.person_a_id === rootId ? r.person_b! : r.person_a!
          return mapTreePerson(spouseRow)
        })

      // ── Round 2: grandparents + parent marriages ────────────────────────────
      const parentIds = parentEdges.map(e => e.parentId)

      let grandparentEdges: TreeParentChildEdge[] = []
      let grandparentPeople: TreePerson[] = []
      let parentMarriageEdges: TreeMarriageEdge[] = []
      let parentSpousePeople: TreePerson[] = []

      if (parentIds.length > 0) {
        const childIdOrClause = parentIds.map(id => `child_id.eq.${id}`).join(',')
        const parentMarriageOrClause = parentIds
          .map(id => `person_a_id.eq.${id},person_b_id.eq.${id}`)
          .join(',')

        const [gpEdgesRes, parentMarriagesRes] = await Promise.all([
          supabase.from('parent_child')
            .select('*, parent:parent_id(*)')
            .or(childIdOrClause),
          supabase.from('marriages')
            .select('*, person_a:person_a_id(*), person_b:person_b_id(*)')
            .or(parentMarriageOrClause),
        ])

        if (gpEdgesRes.error)         throw gpEdgesRes.error
        if (parentMarriagesRes.error) throw parentMarriagesRes.error

        const gpEdgesData         = (gpEdgesRes.data         ?? []) as unknown as ParentChildWithParent[]
        const parentMarriagesData = (parentMarriagesRes.data ?? []) as unknown as MarriageWithPeople[]

        grandparentEdges = gpEdgesData.map((r) => ({
          id:        r.id,
          parentId:  r.parent_id,
          childId:   r.child_id,
          confirmed: r.confirmed,
        }))

        grandparentPeople = gpEdgesData
          .filter((r) => r.parent != null)
          .map((r) => mapTreePerson(r.parent!))

        parentMarriageEdges = parentMarriagesData.map((r) => ({
          id:           r.id,
          personAId:    r.person_a_id,
          personBId:    r.person_b_id,
          marriageDate: r.marriage_date,
        }))

        parentSpousePeople = parentMarriagesData
          .filter((r) => r.person_a != null && r.person_b != null)
          .flatMap((r) => {
            const spouses: TreePerson[] = []
            if (r.person_a && !parentIds.includes(r.person_a_id)) spouses.push(mapTreePerson(r.person_a))
            if (r.person_b && !parentIds.includes(r.person_b_id)) spouses.push(mapTreePerson(r.person_b))
            return spouses
          })
      }

      // ── Assemble subgraph ──────────────────────────────────────────────────
      subgraph.value = {
        rootId,
        people: dedupeById([
          rootPerson,
          ...parentPeople,
          ...childPeople,
          ...rootSpousePeople,
          ...grandparentPeople,
          ...parentSpousePeople,
        ]),
        parentChildEdges: dedupeById([
          ...parentEdges,
          ...childEdges,
          ...grandparentEdges,
        ]),
        marriageEdges: dedupeById([
          ...rootMarriageEdges,
          ...parentMarriageEdges,
        ]),
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return { subgraph, isLoading, error, fetchSubgraph }
})
