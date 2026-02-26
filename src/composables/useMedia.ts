import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Media } from '@/types'
import type { Database } from '@/types/database'

type MediaRow = Database['public']['Tables']['media']['Row']

function mapMedia(row: MediaRow): Media {
  return {
    id: row.id,
    personId: row.person_id,
    storagePath: row.storage_path,
    caption: row.caption,
    yearApprox: row.year_approx,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  }
}

export function useMedia(personId: string) {
  const auth      = useAuthStore()
  const photos    = ref<Media[]>([])
  const urls      = ref<Record<string, string>>({})
  const uploading = ref(false)
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  async function load(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: dbError } = await supabase
        .from('media')
        .select('*')
        .eq('person_id', personId)
        .order('uploaded_at', { ascending: true })
      if (dbError) throw dbError

      photos.value = (data ?? []).map(mapMedia)
      urls.value = {}

      if (photos.value.length > 0) {
        const paths = photos.value.map(p => p.storagePath)
        const { data: signed, error: signError } = await supabase.storage
          .from('media')
          .createSignedUrls(paths, 3600)
        if (signError) throw signError
        const map: Record<string, string> = {}
        for (const entry of signed ?? []) {
          if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl
        }
        urls.value = map
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function upload(file: File, caption?: string, yearApprox?: number): Promise<void> {
    uploading.value = true
    error.value = null
    let storagePath: string | null = null
    let storageUploaded = false
    try {
      storagePath = `${personId}/${crypto.randomUUID()}-${file.name}`

      const { error: storageError } = await supabase.storage
        .from('media')
        .upload(storagePath, file)
      if (storageError) throw storageError
      storageUploaded = true

      const { data: inserted, error: insertError } = await supabase
        .from('media')
        .insert({
          person_id: personId,
          storage_path: storagePath,
          caption: caption ?? null,
          year_approx: yearApprox ?? null,
          uploaded_by: auth.profile?.id ?? null,
        })
        .select()
        .single()
      if (insertError) throw insertError

      const isFirst = photos.value.length === 0
      if (isFirst) {
        const { error: primaryError } = await supabase
          .from('people')
          .update({ primary_photo_id: inserted.id })
          .eq('id', personId)
        if (primaryError) throw primaryError
      }

      await load()
    } catch (err) {
      if (storageUploaded && storagePath) {
        await supabase.storage.from('media').remove([storagePath]).catch(() => {})
      }
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      uploading.value = false
    }
  }

  async function remove(photo: Media): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const { error: storageError } = await supabase.storage
        .from('media')
        .remove([photo.storagePath])
      if (storageError) throw storageError

      const { error: dbError } = await supabase
        .from('media')
        .delete()
        .eq('id', photo.id)
      if (dbError) throw dbError

      await load()

      // If no photos remain, clear the primary photo reference on the person
      if (photos.value.length === 0) {
        await supabase.from('people').update({ primary_photo_id: null }).eq('id', personId)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function setPrimary(photoId: string): Promise<void> {
    error.value = null
    try {
      const { error: dbError } = await supabase
        .from('people')
        .update({ primary_photo_id: photoId })
        .eq('id', personId)
      if (dbError) throw dbError
    } catch (err) {
      error.value = err instanceof Error ? err.message : (err as { message?: string }).message ?? String(err)
      throw err
    }
  }

  return { photos, urls, uploading, isLoading, error, load, upload, remove, setPrimary }
}
