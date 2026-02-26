<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePeopleStore } from '@/stores/people'
import type { PersonSummary, PersonInput } from '@/types'

const auth   = useAuthStore()
const people = usePeopleStore()
const router = useRouter()

type Step = 'searching' | 'matches' | 'no-match'
const step      = ref<Step>('searching')
const matches   = ref<PersonSummary[]>([])
const searchErr = ref<string | null>(null)
const isSaving  = ref(false)
const saveErr   = ref<string | null>(null)

const newPerson = ref<PersonInput>({
  firstName: auth.profile?.firstName ?? '',
  lastName:  auth.profile?.lastName ?? '',
  birthDate: null,
  birthPlace: null,
})

onMounted(async () => {
  if (!auth.profile) return
  try {
    const { data, error } = await supabase
      .from('people')
      .select('id, first_name, last_name, birth_surname, nickname, birth_date, death_date, primary_photo_id')
      .ilike('first_name', `%${auth.profile.firstName}%`)
      .ilike('last_name', `%${auth.profile.lastName}%`)
      .limit(5)

    if (error) throw error
    matches.value = (data ?? []).map(r => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      birthSurname: r.birth_surname,
      nickname: r.nickname,
      birthDate: r.birth_date,
      deathDate: r.death_date,
      primaryPhotoId: r.primary_photo_id,
    }))
    step.value = matches.value.length > 0 ? 'matches' : 'no-match'
  } catch (err) {
    searchErr.value = err instanceof Error ? err.message : 'Search failed'
    step.value = 'no-match'
  }
})

async function confirmMatch(person: PersonSummary) {
  isSaving.value = true
  saveErr.value = null
  try {
    await auth.linkPerson(person.id)
    router.push({ name: 'tree' })
  } catch (err) {
    saveErr.value = err instanceof Error ? err.message : 'Failed to link'
  } finally {
    isSaving.value = false
  }
}

async function createAndLink() {
  isSaving.value = true
  saveErr.value = null
  try {
    const person = await people.createPerson(newPerson.value)
    await auth.linkPerson(person.id)
    router.push({ name: 'tree' })
  } catch (err) {
    saveErr.value = err instanceof Error ? err.message : 'Failed to create'
  } finally {
    isSaving.value = false
  }
}

function skipForNow() {
  router.push({ name: 'tree' })
}

function formatYear(d: string | null) {
  return d ? new Date(d).getFullYear() : null
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-lg">
      <div class="card p-8">
        <h2 class="font-display text-2xl text-walnut mb-2">
          Welcome, {{ auth.profile?.firstName }}!
        </h2>
        <p class="text-walnut-muted text-sm mb-6 leading-relaxed">
          Let's find your record in the family tree so we can personalise your experience.
        </p>

        <!-- Searching -->
        <div v-if="step === 'searching'" class="text-walnut-muted text-sm text-center py-6">
          Searching family records…
        </div>

        <!-- Matches found -->
        <div v-else-if="step === 'matches'" class="space-y-3">
          <p class="text-sm text-walnut mb-4 font-medium">We found some possible matches. Is one of these you?</p>
          <div
            v-for="person in matches"
            :key="person.id"
            class="border border-parchment rounded-lg p-4 hover:border-walnut/40 transition-colors"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-medium text-walnut text-sm">
                  {{ person.firstName }} {{ person.lastName }}
                  <span v-if="person.nickname" class="font-normal text-walnut-muted">"{{ person.nickname }}"</span>
                </p>
                <p class="text-xs text-walnut-muted mt-0.5">
                  <span v-if="formatYear(person.birthDate)">b. {{ formatYear(person.birthDate) }}</span>
                  <span v-if="formatYear(person.deathDate)"> · d. {{ formatYear(person.deathDate) }}</span>
                </p>
              </div>
              <button
                @click="confirmMatch(person)"
                :disabled="isSaving"
                class="btn-primary text-sm flex-shrink-0"
              >
                This is me
              </button>
            </div>
          </div>
          <button
            @click="step = 'no-match'"
            class="text-sm text-walnut-muted hover:text-walnut transition-colors mt-2 block"
          >
            None of these — I need a new record
          </button>
        </div>

        <!-- No match / create form -->
        <div v-else-if="step === 'no-match'">
          <p class="text-sm text-walnut-muted mb-4">
            No matching record found. Fill in a few details and we'll create your record now.
          </p>
          <form @submit.prevent="createAndLink" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-walnut mb-1">First name *</label>
                <input v-model="newPerson.firstName" required class="input w-full" />
              </div>
              <div>
                <label class="block text-xs text-walnut mb-1">Last name *</label>
                <input v-model="newPerson.lastName" required class="input w-full" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-walnut mb-1">Birth date</label>
                <input v-model="newPerson.birthDate" type="date" class="input w-full" />
              </div>
              <div>
                <label class="block text-xs text-walnut mb-1">Birth place</label>
                <input v-model="newPerson.birthPlace" class="input w-full" placeholder="City, State" />
              </div>
            </div>
            <p v-if="saveErr" class="text-red-600 text-sm">{{ saveErr }}</p>
            <button type="submit" :disabled="isSaving" class="btn-primary w-full">
              {{ isSaving ? 'Saving…' : 'Create my record' }}
            </button>
          </form>
        </div>

        <p v-if="searchErr" class="text-amber-600 text-xs mt-3">{{ searchErr }}</p>

        <div class="mt-6 pt-4 border-t border-parchment">
          <button
            @click="skipForNow"
            class="w-full text-sm text-walnut-muted hover:text-walnut transition-colors text-center block"
          >
            Skip for now — I'll do this later
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
