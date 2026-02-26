import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { TreePerson, TreeParentChildEdge, TreeMarriageEdge, TreeSubgraph } from '@/types'
import type { Database } from '@/types/database'

type PersonRow = Database['public']['Tables']['people']['Row']

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
      const rootPersonRes = await supabase.from('people').select('*').eq('id', rootId).single()

      const [parentEdgesRes, childEdgesRes, rootMarriagesRes] = await Promise.all([
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

      if (rootPersonRes.error)    throw rootPersonRes.error
      if (parentEdgesRes.error)   throw parentEdgesRes.error
      if (childEdgesRes.error)    throw childEdgesRes.error
      if (rootMarriagesRes.error) throw rootMarriagesRes.error

      const rootPerson = mapTreePerson(rootPersonRes.data)

      const parentEdges: TreeParentChildEdge[] = (parentEdgesRes.data ?? []).map((r: Record<string, unknown>) => ({
        id:        r['id'] as string,
        parentId:  r['parent_id'] as string,
        childId:   r['child_id'] as string,
        confirmed: r['confirmed'] as boolean,
      }))

      const childEdges: TreeParentChildEdge[] = (childEdgesRes.data ?? []).map((r: Record<string, unknown>) => ({
        id:        r['id'] as string,
        parentId:  r['parent_id'] as string,
        childId:   r['child_id'] as string,
        confirmed: r['confirmed'] as boolean,
      }))

      const parentPeople: TreePerson[] = (parentEdgesRes.data ?? [])
        .filter((r: Record<string, unknown>) => r['parent'] != null)
        .map((r: Record<string, unknown>) => mapTreePerson(r['parent'] as PersonRow))

      const childPeople: TreePerson[] = (childEdgesRes.data ?? [])
        .filter((r: Record<string, unknown>) => r['child'] != null)
        .map((r: Record<string, unknown>) => mapTreePerson(r['child'] as PersonRow))

      const rootMarriageEdges: TreeMarriageEdge[] = (rootMarriagesRes.data ?? []).map((r: Record<string, unknown>) => ({
        id:           r['id'] as string,
        personAId:    r['person_a_id'] as string,
        personBId:    r['person_b_id'] as string,
        marriageDate: r['marriage_date'] as string | null,
      }))

      const rootSpousePeople: TreePerson[] = (rootMarriagesRes.data ?? [])
        .filter((r: Record<string, unknown>) => r['person_a'] != null && r['person_b'] != null)
        .map((r: Record<string, unknown>) => {
          const spouseRow = (r['person_a_id'] as string) === rootId
            ? r['person_b'] as PersonRow
            : r['person_a'] as PersonRow
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

        grandparentEdges = (gpEdgesRes.data ?? []).map((r: Record<string, unknown>) => ({
          id:        r['id'] as string,
          parentId:  r['parent_id'] as string,
          childId:   r['child_id'] as string,
          confirmed: r['confirmed'] as boolean,
        }))

        grandparentPeople = (gpEdgesRes.data ?? [])
          .filter((r: Record<string, unknown>) => r['parent'] != null)
          .map((r: Record<string, unknown>) => mapTreePerson(r['parent'] as PersonRow))

        parentMarriageEdges = (parentMarriagesRes.data ?? []).map((r: Record<string, unknown>) => ({
          id:           r['id'] as string,
          personAId:    r['person_a_id'] as string,
          personBId:    r['person_b_id'] as string,
          marriageDate: r['marriage_date'] as string | null,
        }))

        parentSpousePeople = (parentMarriagesRes.data ?? [])
          .filter((r: Record<string, unknown>) => r['person_a'] != null && r['person_b'] != null)
          .flatMap((r: Record<string, unknown>) => {
            const rows: TreePerson[] = []
            if (r['person_a']) rows.push(mapTreePerson(r['person_a'] as PersonRow))
            if (r['person_b']) rows.push(mapTreePerson(r['person_b'] as PersonRow))
            return rows
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
