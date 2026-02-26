<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePersonDetail } from '@/composables/usePersonDetail'
import { usePeopleStore } from '@/stores/people'
import { useAuthStore } from '@/stores/auth'
import RelationshipPanel from '@/components/RelationshipPanel.vue'
import PhotoGallery from '@/components/PhotoGallery.vue'
import PersonForm from '@/components/PersonForm.vue'
import type { PersonInput } from '@/types'

const route  = useRoute()
const id     = route.params.id as string
const auth   = useAuthStore()
const people = usePeopleStore()
const detail = usePersonDetail(id)

const showEditForm  = ref(false)
const saveError     = ref<string | null>(null)
const primaryPhotoId = ref<string | null>(null)

watch(() => detail.person.value, (p) => {
  if (p) primaryPhotoId.value = p.primaryPhotoId
}, { immediate: true })

onMounted(() => detail.load())

async function handleSave(input: PersonInput) {
  saveError.value = null
  try {
    await people.updatePerson(id, input)
    await detail.load()
    showEditForm.value = false
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save'
  }
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function yearOf(d: string | null) {
  return d ? new Date(d).getFullYear() : null
}

function exportPdf() { window.print() }
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8">
    <!-- Loading -->
    <p v-if="detail.isLoading.value" class="text-walnut-muted text-center py-16">Loading…</p>
    <p v-else-if="detail.error.value" class="text-red-600 text-center py-16">{{ detail.error.value }}</p>

    <template v-else-if="detail.person.value">
      <!-- Header card -->
      <div class="card p-8 mb-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-4xl text-walnut leading-tight">
              {{ detail.person.value.firstName }}
              <span v-if="detail.person.value.nickname" class="text-walnut-muted font-normal italic">
                "{{ detail.person.value.nickname }}"
              </span>
              {{ detail.person.value.lastName }}
              <span v-if="detail.person.value.suffix" class="text-2xl text-walnut-muted"> {{ detail.person.value.suffix }}</span>
            </h1>
            <p v-if="detail.person.value.birthSurname" class="text-walnut-muted mt-1 text-sm">
              née {{ detail.person.value.birthSurname }}
            </p>
            <div class="mt-3 text-sm text-walnut-muted space-y-0.5">
              <p v-if="detail.person.value.birthDate || detail.person.value.birthPlace">
                <span class="text-walnut">Born</span>
                {{ [formatDate(detail.person.value.birthDate), detail.person.value.birthPlace].filter(Boolean).join(' · ') }}
              </p>
              <p v-if="detail.person.value.deathDate || detail.person.value.deathPlace">
                <span class="text-walnut">Died</span>
                {{ [formatDate(detail.person.value.deathDate), detail.person.value.deathPlace].filter(Boolean).join(' · ') }}
              </p>
              <p v-if="detail.person.value.burialPlace">
                <span class="text-walnut">Buried</span> {{ detail.person.value.burialPlace }}
              </p>
            </div>
          </div>
          <div class="flex gap-2 flex-shrink-0 print:hidden">
            <button @click="exportPdf" class="btn-secondary text-sm">
              Export PDF
            </button>
            <button v-if="auth.isEditor" @click="showEditForm = true" class="btn-secondary text-sm">
              Edit
            </button>
          </div>
        </div>
      </div>

      <!-- Biography -->
      <div v-if="detail.person.value.biography" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Biography</h2>
        <p class="text-walnut leading-relaxed whitespace-pre-wrap text-sm">{{ detail.person.value.biography }}</p>
      </div>

      <!-- Notes -->
      <div v-if="detail.person.value.notes" class="card p-5 mb-6 bg-parchment/40">
        <h3 class="font-display text-base text-walnut mb-2">Notes</h3>
        <p class="text-walnut-muted text-sm leading-relaxed">{{ detail.person.value.notes }}</p>
      </div>

      <!-- Residences -->
      <div v-if="detail.residences.value.length" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Residences</h2>
        <div class="divide-y divide-parchment">
          <div v-for="r in detail.residences.value" :key="r.id" class="flex items-center justify-between py-2 text-sm">
            <span class="text-walnut">{{ r.location }}</span>
            <span class="text-walnut-muted text-xs">
              <template v-if="r.isCurrent">Current</template>
              <template v-else-if="r.fromDate || r.toDate">
                {{ yearOf(r.fromDate) ?? '?' }} – {{ yearOf(r.toDate) ?? '?' }}
              </template>
            </span>
          </div>
        </div>
      </div>

      <!-- Education -->
      <div v-if="detail.education.value.length" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Education</h2>
        <div class="divide-y divide-parchment">
          <div v-for="e in detail.education.value" :key="e.id" class="py-2 text-sm">
            <span class="text-walnut font-medium">{{ e.institution }}</span>
            <span class="text-walnut-muted ml-2 text-xs capitalize">{{ e.institutionType.replace('_', ' ') }}</span>
            <span v-if="e.startYear || e.endYear" class="text-walnut-muted ml-2 text-xs">
              {{ e.startYear ?? '?' }} – {{ e.endYear ?? '?' }}
            </span>
            <span v-if="e.graduated === true" class="text-walnut-muted ml-2 text-xs">· Graduated</span>
          </div>
        </div>
      </div>

      <!-- Occupations -->
      <div v-if="detail.occupations.value.length" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Career</h2>
        <div class="divide-y divide-parchment">
          <div v-for="o in detail.occupations.value" :key="o.id" class="py-2 text-sm">
            <span class="text-walnut font-medium">{{ o.title ?? 'Unknown title' }}</span>
            <span v-if="o.employer" class="text-walnut-muted ml-2">at {{ o.employer }}</span>
            <span v-if="o.isCurrent" class="text-walnut-muted ml-2 text-xs">(current)</span>
            <span v-else-if="o.fromDate || o.toDate" class="text-walnut-muted ml-2 text-xs">
              {{ yearOf(o.fromDate) ?? '?' }} – {{ yearOf(o.toDate) ?? '?' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Military -->
      <div v-if="detail.militaryService.value.length" class="card p-6 mb-6">
        <h2 class="font-display text-xl text-walnut mb-3">Military Service</h2>
        <div class="divide-y divide-parchment">
          <div v-for="m in detail.militaryService.value" :key="m.id" class="py-2 text-sm">
            <span class="text-walnut font-medium">{{ m.branch ?? 'Unknown branch' }}</span>
            <span v-if="m.rank" class="text-walnut-muted ml-2">{{ m.rank }}</span>
            <span v-if="m.fromDate || m.toDate" class="text-walnut-muted ml-2 text-xs">
              {{ yearOf(m.fromDate) ?? '?' }} – {{ yearOf(m.toDate) ?? '?' }}
            </span>
            <p v-if="m.notes" class="text-walnut-muted text-xs mt-0.5 ml-0">{{ m.notes }}</p>
          </div>
        </div>
      </div>

      <!-- Photo gallery -->
      <PhotoGallery
        :person-id="id"
        :primary-photo-id="primaryPhotoId"
        class="mb-6"
        @primary-changed="primaryPhotoId = $event"
      />

      <!-- Relationships -->
      <RelationshipPanel
        :person-id="id"
        :parents="detail.parents.value"
        :children="detail.children.value"
        :spouses="detail.spouses.value"
        class="mb-6"
        @reload="detail.load()"
      />

      <!-- Edit modal -->
      <PersonForm
        :is-open="showEditForm"
        :person="detail.person.value"
        @save="handleSave"
        @close="showEditForm = false"
      />
      <p v-if="saveError" class="text-red-600 text-sm mt-2 text-center">{{ saveError }}</p>
    </template>
  </div>
</template>
