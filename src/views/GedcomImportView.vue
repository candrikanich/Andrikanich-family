<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGedcomImport } from '@/composables/useGedcomImport'
import { usePeopleStore } from '@/stores/people'
import { useAuthStore } from '@/stores/auth'
import type { GedcomImportResult } from '@/types'

const auth   = useAuthStore()
const people = usePeopleStore()
const gedcom = useGedcomImport()

type Step = 'upload' | 'preview' | 'importing' | 'done'

const step      = ref<Step>('upload')
const result    = ref<GedcomImportResult | null>(null)
const file      = ref<File | null>(null)
const fileError = ref<string | null>(null)

function onFileChange(e: Event) {
  const input    = e.target as HTMLInputElement
  const selected = input.files?.[0]
  fileError.value = null
  if (!selected) { file.value = null; return }
  if (!selected.name.toLowerCase().endsWith('.ged')) {
    fileError.value = 'Only .ged files are supported'
    file.value = null
    return
  }
  file.value = selected
}

async function onParse() {
  if (!file.value) return
  await people.fetchPeople()
  const summaries = people.list.map(p => ({
    id: p.id, firstName: p.firstName, lastName: p.lastName,
    birthSurname: p.birthSurname, nickname: p.nickname,
    birthDate: p.birthDate, deathDate: p.deathDate, primaryPhotoId: p.primaryPhotoId,
  }))
  await gedcom.parseFile(file.value, summaries)
  step.value = 'preview'
}

async function onImport() {
  step.value = 'importing'
  result.value = await gedcom.runImport(auth.profile!.id)
  step.value = 'done'
}

function onReset() {
  gedcom.reset()
  step.value  = 'upload'
  result.value = null
  file.value   = null
  fileError.value = null
}

const samplePeople = computed(() => gedcom.preview.value?.people.slice(0, 20) ?? [])
const importCount  = computed(() => gedcom.preview.value?.people.length ?? 0)
const progressPct  = computed(() =>
  gedcom.total.value > 0 ? (gedcom.progress.value / gedcom.total.value) * 100 : 0
)
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10">
    <h1 class="font-display text-3xl text-walnut mb-8">Import GEDCOM</h1>

    <!-- Step 1: Upload -->
    <div v-if="step === 'upload'" class="card p-8 space-y-6">
      <p class="text-walnut-muted">
        Upload a <code class="bg-cream px-1 rounded">.ged</code> file exported from genealogy software
        (Family Tree Maker, Ancestry, MacFamilyTree, etc.).
      </p>

      <div>
        <label class="block text-sm font-medium text-walnut mb-2">GEDCOM File</label>
        <input
          type="file"
          accept=".ged"
          class="block w-full text-sm text-walnut-muted
                 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0
                 file:bg-cream file:text-walnut hover:file:bg-parchment cursor-pointer"
          @change="onFileChange"
        />
        <p v-if="fileError" class="mt-1 text-sm text-red-600">{{ fileError }}</p>
      </div>

      <p v-if="gedcom.error.value" class="text-sm text-red-600">{{ gedcom.error.value }}</p>

      <div class="flex gap-3">
        <button
          class="btn-primary"
          :disabled="!file || gedcom.isLoading.value"
          @click="onParse"
        >
          {{ gedcom.isLoading.value ? 'Parsing…' : 'Parse File' }}
        </button>
        <RouterLink to="/admin" class="btn-secondary">Cancel</RouterLink>
      </div>
    </div>

    <!-- Step 2: Preview -->
    <div v-else-if="step === 'preview' && gedcom.preview.value" class="space-y-6">
      <!-- Summary cards -->
      <div class="card p-6 grid grid-cols-3 gap-4 text-center">
        <div>
          <p class="text-3xl font-display text-walnut">{{ gedcom.preview.value.people.length }}</p>
          <p class="text-sm text-walnut-muted">People to import</p>
        </div>
        <div>
          <p class="text-3xl font-display text-walnut">{{ gedcom.preview.value.families.length }}</p>
          <p class="text-sm text-walnut-muted">Families</p>
        </div>
        <div>
          <p class="text-3xl font-display text-walnut">{{ gedcom.preview.value.conflicts.length }}</p>
          <p class="text-sm text-walnut-muted">Conflicts (skipped)</p>
        </div>
      </div>

      <!-- Sample table -->
      <div class="card overflow-hidden">
        <div class="px-4 py-3 border-b border-cream-dark">
          <h2 class="font-medium text-walnut">Sample records (first 20)</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-cream text-walnut-muted">
              <tr>
                <th class="px-4 py-2 text-left font-medium">Name</th>
                <th class="px-4 py-2 text-left font-medium">Birth year</th>
                <th class="px-4 py-2 text-left font-medium">Death year</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="person in samplePeople"
                :key="person.gedcomId"
                class="border-t border-cream-dark"
              >
                <td class="px-4 py-2 text-walnut">{{ person.firstName }} {{ person.lastName }}</td>
                <td class="px-4 py-2 text-walnut-muted">{{ person.birthDate?.slice(0, 4) ?? '—' }}</td>
                <td class="px-4 py-2 text-walnut-muted">{{ person.deathDate?.slice(0, 4) ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Conflicts -->
      <div v-if="gedcom.preview.value.conflicts.length > 0" class="card p-6">
        <h2 class="font-medium text-walnut mb-3">Conflicts — these will be skipped</h2>
        <ul class="space-y-1 text-sm text-walnut-muted">
          <li
            v-for="c in gedcom.preview.value.conflicts"
            :key="c.gedcomPerson.gedcomId"
          >
            <span class="text-walnut font-medium">
              {{ c.gedcomPerson.firstName }} {{ c.gedcomPerson.lastName }}
            </span>
            — already exists as
            <RouterLink
              :to="`/people/${c.existingPersonId}`"
              class="underline hover:text-walnut"
            >{{ c.existingPersonName }}</RouterLink>
          </li>
        </ul>
      </div>

      <div class="flex gap-3">
        <button class="btn-primary" @click="onImport">
          Import {{ importCount }} {{ importCount === 1 ? 'person' : 'people' }}
        </button>
        <button class="btn-secondary" @click="step = 'upload'; gedcom.reset()">Back</button>
      </div>
    </div>

    <!-- Step 3: Importing -->
    <div v-else-if="step === 'importing'" class="card p-8 space-y-4">
      <p class="font-medium text-walnut">Importing…</p>
      <div class="w-full bg-cream-dark rounded-full h-2 overflow-hidden">
        <div
          class="bg-walnut h-2 rounded-full transition-all duration-300"
          :style="{ width: `${progressPct}%` }"
        />
      </div>
      <p class="text-sm text-walnut-muted">
        {{ gedcom.progress.value }} / {{ gedcom.total.value }} people
      </p>
    </div>

    <!-- Step 4: Done -->
    <div v-else-if="step === 'done' && result" class="card p-8 space-y-4">
      <p class="text-xl font-display text-walnut">Import complete</p>
      <p class="text-walnut-muted">
        {{ result.created }} {{ result.created === 1 ? 'person' : 'people' }} added,
        {{ result.skipped }} skipped (conflicts)
      </p>

      <div v-if="result.conflicts.length > 0" class="pt-2">
        <p class="text-sm font-medium text-walnut mb-1">Skipped conflicts:</p>
        <ul class="text-sm text-walnut-muted space-y-1">
          <li v-for="c in result.conflicts" :key="c.gedcomPerson.gedcomId">
            {{ c.gedcomPerson.firstName }} {{ c.gedcomPerson.lastName }} →
            <RouterLink :to="`/people/${c.existingPersonId}`" class="underline hover:text-walnut">
              {{ c.existingPersonName }}
            </RouterLink>
          </li>
        </ul>
      </div>

      <div class="flex gap-3 pt-2">
        <RouterLink to="/people" class="btn-primary">Browse People</RouterLink>
        <button class="btn-secondary" @click="onReset">Import Another File</button>
      </div>
    </div>
  </div>
</template>
