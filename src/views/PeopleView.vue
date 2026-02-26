<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { usePeopleStore } from '@/stores/people'
import { useAuthStore } from '@/stores/auth'
import PersonCard from '@/components/PersonCard.vue'
import PersonForm from '@/components/PersonForm.vue'
import type { PersonInput } from '@/types'

const people = usePeopleStore()
const auth   = useAuthStore()

const query        = ref('')
const birthYearMin = ref<number | undefined>()
const birthYearMax = ref<number | undefined>()
const location     = ref('')
const showForm     = ref(false)
const formError    = ref<string | null>(null)

let debounceTimer: ReturnType<typeof setTimeout>

function triggerSearch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    people.fetchPeople({
      query: query.value || undefined,
      birthYearMin: birthYearMin.value,
      birthYearMax: birthYearMax.value,
      location: location.value || undefined,
    })
  }, 300)
}

watch([query, birthYearMin, birthYearMax, location], triggerSearch)

onMounted(() => people.fetchPeople())
onUnmounted(() => clearTimeout(debounceTimer))

async function handleSave(input: PersonInput) {
  formError.value = null
  try {
    await people.createPerson(input)
    showForm.value = false
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Failed to save'
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="font-display text-3xl text-walnut">Family Records</h1>
      <button v-if="auth.isEditor" @click="showForm = true" class="btn-primary">
        + Add Person
      </button>
    </div>

    <!-- Search + filters -->
    <div class="card p-4 mb-6 space-y-3">
      <input
        v-model="query"
        class="input w-full"
        placeholder="Search by name, nickname, maiden name…"
      />
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-xs text-walnut-muted mb-1">Born after</label>
          <input v-model.number="birthYearMin" type="number" class="input w-full" placeholder="e.g. 1900" min="1800" max="2100" />
        </div>
        <div>
          <label class="block text-xs text-walnut-muted mb-1">Born before</label>
          <input v-model.number="birthYearMax" type="number" class="input w-full" placeholder="e.g. 1980" min="1800" max="2100" />
        </div>
        <div>
          <label class="block text-xs text-walnut-muted mb-1">Location</label>
          <input v-model="location" class="input w-full" placeholder="City or state" />
        </div>
      </div>
    </div>

    <!-- Loading -->
    <p v-if="people.isLoading" class="text-walnut-muted text-center py-12">Loading records…</p>

    <!-- Error -->
    <p v-else-if="people.error" class="text-red-600 text-center py-12">{{ people.error }}</p>

    <!-- Results -->
    <template v-else>
      <p class="text-walnut-muted text-xs mb-3">
        {{ people.list.length }} {{ people.list.length === 1 ? 'record' : 'records' }}
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <PersonCard v-for="person in people.list" :key="person.id" :person="person" />
      </div>
      <div v-if="people.list.length === 0" class="text-center py-16">
        <p class="text-walnut-muted mb-3">No records found.</p>
        <button v-if="auth.isEditor" @click="showForm = true" class="btn-primary">
          Add the first person
        </button>
      </div>
    </template>

    <!-- Create form -->
    <PersonForm :is-open="showForm" @save="handleSave" @close="showForm = false" />
    <p v-if="formError" class="text-red-600 text-sm mt-3 text-center">{{ formError }}</p>
  </div>
</template>
