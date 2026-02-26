import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Document, ExtractionResult } from '@/types'

function mapDocument(row: {
  id: string
  person_id: string
  storage_path: string
  original_filename: string
  mime_type: string
  uploaded_by: string | null
  uploaded_at: string
  extraction_status: string
}): Document {
  return {
    id: row.id,
    personId: row.person_id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    extractionStatus: row.extraction_status as Document['extractionStatus'],
  }
}

export const useDocumentsStore = defineStore('documents', () => {
  const documents = ref<Document[]>([])
  const uploading = ref(false)
  const extracting = ref(false)
  const error = ref<string | null>(null)
  const currentResult = ref<ExtractionResult | null>(null)

  async function uploadDocument(personId: string, file: File): Promise<{ documentId: string; result: ExtractionResult }> {
    uploading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const storagePath = `${personId}/${crypto.randomUUID()}-${file.name}`

      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)
      if (storageError) throw storageError

      const { data: docRow, error: insertError } = await supabase
        .from('documents')
        .insert({
          person_id: personId,
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: file.type,
          uploaded_by: authStore.profile?.id ?? null,
          extraction_status: 'pending',
        })
        .select()
        .single()
      if (insertError) throw insertError

      uploading.value = false
      extracting.value = true

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'extract-document',
        { body: { documentId: docRow.id } },
      )
      if (fnError) throw fnError

      const result = fnData as ExtractionResult
      const documentId = docRow.id
      extracting.value = false
      currentResult.value = result
      return { documentId, result }
    } catch (err) {
      uploading.value = false
      extracting.value = false
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  async function fetchDocuments(personId: string): Promise<void> {
    error.value = null
    try {
      const { data, error: dbError } = await supabase
        .from('documents')
        .select('*')
        .eq('person_id', personId)
        .order('uploaded_at', { ascending: false })
      if (dbError) throw dbError
      documents.value = (data ?? []).map(mapDocument)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  async function commitExtraction(
    documentId: string,
    result: ExtractionResult,
    personId: string,
  ): Promise<void> {
    error.value = null
    try {
      // Build patch from non-empty person fields
      const p = result.person
      const patch: Record<string, unknown> = {}
      if (p.firstName?.value)    patch.first_name    = p.firstName.value
      if (p.lastName?.value)     patch.last_name     = p.lastName.value
      if (p.birthSurname?.value) patch.birth_surname = p.birthSurname.value
      if (p.nickname?.value)     patch.nickname      = p.nickname.value
      if (p.suffix?.value)       patch.suffix        = p.suffix.value
      if (p.nameVariants?.length) patch.name_variants = p.nameVariants
      if (p.birthDate?.value)    patch.birth_date    = p.birthDate.value
      if (p.birthPlace?.value)   patch.birth_place   = p.birthPlace.value
      if (p.deathDate?.value)    patch.death_date    = p.deathDate.value
      if (p.deathPlace?.value)   patch.death_place   = p.deathPlace.value
      if (p.burialPlace?.value)  patch.burial_place  = p.burialPlace.value
      if (p.biography)           patch.biography     = p.biography
      if (p.notes)               patch.notes         = p.notes

      if (Object.keys(patch).length > 0) {
        const { error: patchError } = await supabase
          .from('people')
          .update(patch)
          .eq('id', personId)
        if (patchError) throw patchError
      }

      if (result.residences.length > 0) {
        const { error: resError } = await supabase.from('residences').insert(
          result.residences.map(r => ({
            person_id: personId,
            location: r.location,
            from_date: r.fromDate ?? null,
            to_date: r.toDate ?? null,
            is_current: r.isCurrent,
            sort_order: 0,
          })),
        )
        if (resError) throw resError
      }

      if (result.education.length > 0) {
        const { error: eduError } = await supabase.from('education').insert(
          result.education.map(e => ({
            person_id: personId,
            institution: e.institution,
            institution_type: e.institutionType,
            start_year: e.startYear ?? null,
            end_year: e.endYear ?? null,
            graduated: e.graduated ?? null,
            location: null,
            notes: null,
          })),
        )
        if (eduError) throw eduError
      }

      if (result.occupations.length > 0) {
        const { error: occError } = await supabase.from('occupations').insert(
          result.occupations.map(o => ({
            person_id: personId,
            employer: o.employer ?? null,
            title: o.title ?? null,
            from_date: o.fromDate ?? null,
            to_date: o.toDate ?? null,
            is_current: o.isCurrent,
          })),
        )
        if (occError) throw occError
      }

      if (result.militaryService.length > 0) {
        const { error: milError } = await supabase.from('military_service').insert(
          result.militaryService.map(m => ({
            person_id: personId,
            branch: m.branch,
            rank: m.rank ?? null,
            from_date: m.fromDate ?? null,
            to_date: m.toDate ?? null,
            notes: m.notes ?? null,
          })),
        )
        if (milError) throw milError
      }

      const { error: statusError } = await supabase
        .from('documents')
        .update({ extraction_status: 'committed' })
        .eq('id', documentId)
      if (statusError) throw statusError

      documents.value = documents.value.map(d =>
        d.id === documentId ? { ...d, extractionStatus: 'committed' as const } : d,
      )
      currentResult.value = null
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  async function dismissDocument(documentId: string): Promise<void> {
    error.value = null
    try {
      const { error: dbError } = await supabase
        .from('documents')
        .update({ extraction_status: 'reviewed' })
        .eq('id', documentId)
      if (dbError) throw dbError
      documents.value = documents.value.filter(d => d.id !== documentId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  return {
    documents,
    uploading,
    extracting,
    error,
    currentResult,
    uploadDocument,
    fetchDocuments,
    commitExtraction,
    dismissDocument,
  }
})
