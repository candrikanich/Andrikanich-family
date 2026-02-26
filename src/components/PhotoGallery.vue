<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMedia } from '@/composables/useMedia'
import { useAuthStore } from '@/stores/auth'
import type { Media } from '@/types'

const props = defineProps<{
  personId: string
  primaryPhotoId: string | null
}>()

const emit = defineEmits<{
  primaryChanged: [photoId: string]
}>()

const auth    = useAuthStore()
const media   = useMedia(props.personId)
const lightbox = ref<Media | null>(null)

const showUpload  = ref(false)
const caption     = ref('')
const yearApprox  = ref<number | ''>('')
const uploadError = ref<string | null>(null)

onMounted(() => media.load())

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadError.value = null
  try {
    await media.upload(file, caption.value || undefined, yearApprox.value !== '' ? Number(yearApprox.value) : undefined)
    showUpload.value = false
    caption.value    = ''
    yearApprox.value = ''
    const first = media.photos.value[0]
    if (media.photos.value.length === 1 && first) {
      emit('primaryChanged', first.id)
    }
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed'
  }
}

async function handleSetPrimary(photo: Media) {
  await media.setPrimary(photo.id)
  emit('primaryChanged', photo.id)
}

async function handleRemove(photo: Media) {
  if (!confirm('Delete this photo?')) return
  await media.remove(photo)
  const next = media.photos.value[0]
  if (props.primaryPhotoId === photo.id && next) {
    emit('primaryChanged', next.id)
  }
}
</script>

<template>
  <div class="card p-6 mb-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-display text-xl text-walnut">Photos</h2>
      <button v-if="auth.isEditor" @click="showUpload = !showUpload" class="btn-secondary text-sm">
        + Add Photo
      </button>
    </div>

    <!-- Upload form -->
    <div v-if="showUpload && auth.isEditor" class="mb-4 p-4 border border-parchment rounded bg-cream/50 space-y-3">
      <div>
        <label class="form-label">Photo</label>
        <input type="file" accept="image/jpeg,image/png,image/webp"
               class="form-input text-sm" @change="handleFileSelected" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">Caption (optional)</label>
          <input v-model="caption" type="text" placeholder="e.g. Wedding day" class="form-input text-sm" />
        </div>
        <div>
          <label class="form-label">Approx. year</label>
          <input v-model="yearApprox" type="number" placeholder="e.g. 1950" class="form-input text-sm" />
        </div>
      </div>
      <p v-if="uploadError" class="error-text">{{ uploadError }}</p>
      <p v-if="media.uploading.value" class="text-sm text-walnut-muted">Uploading…</p>
    </div>

    <!-- Loading state -->
    <p v-if="media.isLoading.value" class="text-sm text-walnut-muted text-center py-4">Loading photos…</p>

    <!-- Empty state -->
    <p v-else-if="!media.photos.value.length" class="text-sm text-walnut-muted text-center py-6">
      No photos yet.
      <span v-if="auth.isEditor"> Click "+ Add Photo" to upload one.</span>
    </p>

    <!-- Photo grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div
        v-for="photo in media.photos.value"
        :key="photo.id"
        class="relative group aspect-square overflow-hidden rounded-lg border border-parchment bg-cream cursor-pointer"
        @click="lightbox = photo"
      >
        <img
          v-if="media.urls.value[photo.storagePath]"
          :src="media.urls.value[photo.storagePath]"
          :alt="photo.caption ?? 'Family photo'"
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-walnut/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
          <span v-if="photo.caption" class="text-cream text-xs text-center truncate w-full">{{ photo.caption }}</span>
          <span v-if="photo.yearApprox" class="text-cream/80 text-xs">{{ photo.yearApprox }}</span>
          <div v-if="auth.isEditor" class="flex gap-2 mt-1" @click.stop>
            <button
              v-if="primaryPhotoId !== photo.id"
              @click="handleSetPrimary(photo)"
              class="text-xs bg-cream/20 text-cream px-2 py-1 rounded hover:bg-cream/30 transition-colors"
            >
              Set as primary
            </button>
            <span v-else class="text-xs text-dusty-light font-medium">Primary</span>
            <button
              @click="handleRemove(photo)"
              class="text-xs bg-red-600/70 text-cream px-2 py-1 rounded hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
        <!-- Primary badge -->
        <div v-if="primaryPhotoId === photo.id"
             class="absolute top-1 left-1 bg-dusty text-cream text-xs px-1.5 py-0.5 rounded">
          Primary
        </div>
      </div>
    </div>

    <p v-if="media.error.value" class="error-text mt-3">{{ media.error.value }}</p>

    <!-- Lightbox -->
    <div
      v-if="lightbox"
      class="fixed inset-0 bg-walnut/90 z-50 flex items-center justify-center p-4"
      @click="lightbox = null"
    >
      <div class="max-w-3xl max-h-full" @click.stop>
        <img
          v-if="media.urls.value[lightbox.storagePath]"
          :src="media.urls.value[lightbox.storagePath]"
          :alt="lightbox.caption ?? 'Family photo'"
          class="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
        />
        <p v-if="lightbox.caption" class="text-cream text-center mt-3 text-sm">
          {{ lightbox.caption }}<span v-if="lightbox.yearApprox"> · {{ lightbox.yearApprox }}</span>
        </p>
        <button @click="lightbox = null" class="absolute top-4 right-4 text-cream text-2xl leading-none">×</button>
      </div>
    </div>
  </div>
</template>
