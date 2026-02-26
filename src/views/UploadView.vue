<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePeopleStore } from '@/stores/people'
import { useDocumentsStore } from '@/stores/documents'
import type { Person } from '@/types'

const router = useRouter()
const peopleStore = usePeopleStore()
const documentsStore = useDocumentsStore()

// ─── Person selector state ────────────────────────────────────────────────────

const searchQuery = ref('')
const selectedPerson = ref<Person | null>(null)
const showDropdown = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

function onSearchInput() {
  selectedPerson.value = null
  if (searchTimer) clearTimeout(searchTimer)

  if (!searchQuery.value.trim()) {
    showDropdown.value = false
    return
  }

  searchTimer = setTimeout(async () => {
    await peopleStore.fetchPeople({ query: searchQuery.value.trim() })
    showDropdown.value = peopleStore.list.length > 0
  }, 300)
}

function selectPerson(person: Person) {
  selectedPerson.value = person
  searchQuery.value = `${person.firstName} ${person.lastName}`
  showDropdown.value = false
}

function clearSelection() {
  selectedPerson.value = null
  searchQuery.value = ''
  showDropdown.value = false
}

function onSearchBlur() {
  setTimeout(() => { showDropdown.value = false }, 150)
}

watch(searchQuery, (val) => {
  if (!val) clearSelection()
})

function birthYearOf(person: Person): string {
  return person.birthDate ? String(new Date(person.birthDate).getFullYear()) : ''
}

// ─── File drop zone state ─────────────────────────────────────────────────────

const selectedFile = ref<File | null>(null)
const fileError = ref<string | null>(null)
const isDragging = ref(false)

const ACCEPTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
]
const ACCEPTED_EXTENSIONS = ['.docx', '.pdf']
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

function validateFile(file: File): string | null {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
  if (!ACCEPTED_EXTENSIONS.includes(ext) || !ACCEPTED_TYPES.includes(file.type)) {
    return 'Only .docx and .pdf files are supported.'
  }
  if (file.size > MAX_BYTES) {
    return 'File exceeds the 50 MB size limit.'
  }
  return null
}

function handleFiles(files: FileList | null) {
  fileError.value = null
  if (!files || files.length === 0) return
  const file = files[0] as File
  const err = validateFile(file)
  if (err) {
    fileError.value = err
    selectedFile.value = null
    return
  }
  selectedFile.value = file
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  handleFiles(input.files)
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  handleFiles(event.dataTransfer?.files ?? null)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Upload progress state ────────────────────────────────────────────────────

type UploadState = 'idle' | 'uploading' | 'extracting' | 'done'

const uploadState = computed<UploadState>(() => {
  if (documentsStore.extracting) return 'extracting'
  if (documentsStore.uploading) return 'uploading'
  return 'idle'
})

const isProcessing = computed(() => uploadState.value === 'uploading' || uploadState.value === 'extracting')

const canSubmit = computed(
  () => selectedPerson.value !== null && selectedFile.value !== null && !isProcessing.value,
)

async function handleUpload() {
  if (!canSubmit.value || !selectedPerson.value || !selectedFile.value) return

  documentsStore.error = null
  try {
    const { documentId, result } = await documentsStore.uploadDocument(selectedPerson.value.id, selectedFile.value)
    router.push({
      name: 'document-review',
      params: { id: documentId },
      // JSON round-trip produces a plain object satisfying HistoryState's index
      // signature requirement; ExtractionResult is fully JSON-serializable
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      state: { result: JSON.parse(JSON.stringify(result)), personId: selectedPerson.value.id },
    })
  } catch {
    // documentsStore.error is set in the store
  }
}
</script>

<template>
  <div class="min-h-screen bg-cream px-4 py-10">
    <div class="max-w-xl mx-auto">
      <div class="mb-8">
        <h1 class="font-display text-3xl text-walnut">Upload Document</h1>
        <p class="text-walnut-muted text-sm mt-1">Upload a .docx or .pdf to extract family history data with AI.</p>
      </div>

      <div class="card p-8 space-y-7">

        <!-- ── Person selector ──────────────────────────────────────────────── -->
        <div>
          <label class="form-label">Family member</label>
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              class="form-input pr-8"
              placeholder="Search by name…"
              :disabled="isProcessing"
              autocomplete="off"
              @input="onSearchInput"
              @blur="onSearchBlur"
              @focus="() => { if (searchQuery && !selectedPerson) showDropdown = peopleStore.list.length > 0 }"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-walnut-muted hover:text-walnut text-lg leading-none"
              @mousedown.prevent="clearSelection"
              aria-label="Clear selection"
            >
              &times;
            </button>

            <!-- Dropdown results -->
            <ul
              v-if="showDropdown && !isProcessing"
              class="absolute z-20 mt-1 w-full bg-white border border-parchment rounded-lg shadow-lg max-h-52 overflow-y-auto"
            >
              <li
                v-for="person in peopleStore.list"
                :key="person.id"
                class="px-4 py-2.5 cursor-pointer hover:bg-cream-dark text-sm flex items-baseline justify-between"
                @mousedown.prevent="selectPerson(person)"
              >
                <span class="text-walnut font-medium">{{ person.firstName }} {{ person.lastName }}</span>
                <span v-if="birthYearOf(person)" class="text-walnut-muted text-xs ml-3">b. {{ birthYearOf(person) }}</span>
              </li>
            </ul>
          </div>
          <p v-if="selectedPerson" class="text-xs text-sage mt-1.5">
            Selected: {{ selectedPerson.firstName }} {{ selectedPerson.lastName }}
          </p>
        </div>

        <!-- ── Drop zone ────────────────────────────────────────────────────── -->
        <div>
          <label class="form-label">Document file</label>
          <label
            :class="[
              'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors',
              isDragging
                ? 'border-walnut bg-cream-dark'
                : 'border-parchment bg-cream hover:border-walnut/40',
              isProcessing ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
            ]"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onDrop"
          >
            <input
              type="file"
              accept=".docx,.pdf"
              class="sr-only"
              :disabled="isProcessing"
              @change="onFileInput"
            />

            <svg class="w-8 h-8 text-walnut-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>

            <template v-if="selectedFile">
              <p class="text-sm font-medium text-walnut">{{ selectedFile.name }}</p>
              <p class="text-xs text-walnut-muted">{{ formatBytes(selectedFile.size) }}</p>
            </template>
            <template v-else>
              <p class="text-sm text-walnut-muted">Drag &amp; drop or <span class="text-walnut font-medium underline">browse</span></p>
              <p class="text-xs text-walnut-muted">.docx or .pdf — max 50 MB</p>
            </template>
          </label>

          <p v-if="fileError" class="error-text mt-1.5">{{ fileError }}</p>
        </div>

        <!-- ── Store-level error ────────────────────────────────────────────── -->
        <p v-if="documentsStore.error" class="error-text">{{ documentsStore.error }}</p>

        <!-- ── Progress states ─────────────────────────────────────────────── -->
        <div v-if="isProcessing" class="flex items-center gap-3 text-sm text-walnut-muted">
          <svg class="w-4 h-4 animate-spin text-walnut" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span v-if="uploadState === 'uploading'">Uploading file…</span>
          <span v-else-if="uploadState === 'extracting'">Extracting data with AI…</span>
        </div>

        <!-- ── Upload button ────────────────────────────────────────────────── -->
        <button
          type="button"
          class="btn-primary w-full"
          :disabled="!canSubmit"
          @click="handleUpload"
        >
          Upload &amp; Extract
        </button>
      </div>
    </div>
  </div>
</template>
