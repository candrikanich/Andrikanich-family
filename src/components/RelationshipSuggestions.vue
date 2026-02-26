<script setup lang="ts">
import { reactive, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/services/supabase'
import { usePeopleStore } from '@/stores/people'
import type { RelationshipSuggestion, PersonSummary } from '@/types'

const props = defineProps<{
  suggestions: RelationshipSuggestion[]
  personId: string
}>()

const peopleStore = usePeopleStore()

// ─── Per-suggestion state ──────────────────────────────────────────────────

type SuggestionStatus = 'pending' | 'linking' | 'linked' | 'skipped' | 'error' | 'creating'

interface SuggestionState {
  status: SuggestionStatus
  matchedPerson: PersonSummary | null
  errorMessage: string | null
  newFirstName: string
  newLastName: string
  newBirthDate: string
}

function makeState(s: RelationshipSuggestion): SuggestionState {
  return {
    status: 'pending',
    matchedPerson: s.matchedPerson ?? null,
    errorMessage: null,
    newFirstName: '',
    newLastName: '',
    newBirthDate: '',
  }
}

const states = reactive<SuggestionState[]>(props.suggestions.map(makeState))

// ─── Auto-search on mount ──────────────────────────────────────────────────

let isMounted = true

onMounted(async () => {
  const searches = props.suggestions.map(async (s, i) => {
    const state = states[i]
    if (!state || state.matchedPerson) return
    try {
      await peopleStore.fetchPeople({ query: s.mentionedName })
      const match = peopleStore.list[0]
      if (match && isMounted) {
        state.matchedPerson = {
          id: match.id,
          firstName: match.firstName,
          lastName: match.lastName,
          birthSurname: match.birthSurname,
          nickname: match.nickname,
          birthDate: match.birthDate,
          deathDate: match.deathDate,
          primaryPhotoId: match.primaryPhotoId,
        }
      }
    } catch {
      // Silent — no match found is fine
    }
  })
  await Promise.all(searches)
})

onUnmounted(() => {
  isMounted = false
})

// ─── Relationship type display ──────────────────────────────────────────────

function badgeLabel(type: RelationshipSuggestion['relationshipType']): string {
  const labels: Record<RelationshipSuggestion['relationshipType'], string> = {
    parent: 'Parent',
    child: 'Child',
    sibling: 'Sibling',
    spouse: 'Spouse',
  }
  return labels[type]
}

function badgeClass(type: RelationshipSuggestion['relationshipType']): string {
  const base = 'inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide'
  const colors: Record<RelationshipSuggestion['relationshipType'], string> = {
    parent:  'bg-sage-muted text-walnut',
    child:   'bg-parchment-light text-walnut',
    sibling: 'bg-dusty-muted text-walnut',
    spouse:  'bg-cream-dark text-walnut',
  }
  return `${base} ${colors[type]}`
}

// ─── Relationship DB operations ────────────────────────────────────────────

async function performLink(
  type: RelationshipSuggestion['relationshipType'],
  targetPersonId: string
) {
  if (type === 'parent') {
    const { error } = await supabase.from('parent_child').insert({
      parent_id: targetPersonId,
      child_id: props.personId,
      relationship_type: 'biological',
      confirmed: true,
    })
    if (error) throw error

  } else if (type === 'child') {
    const { error } = await supabase.from('parent_child').insert({
      parent_id: props.personId,
      child_id: targetPersonId,
      relationship_type: 'biological',
      confirmed: true,
    })
    if (error) throw error

  } else if (type === 'sibling') {
    const { data: parentRows, error: fetchError } = await supabase
      .from('parent_child')
      .select('parent_id')
      .eq('child_id', props.personId)

    if (fetchError) throw fetchError
    if (!parentRows || parentRows.length === 0) {
      throw new Error('Cannot link sibling — add parents first.')
    }

    for (const row of parentRows) {
      const { error } = await supabase.from('parent_child').insert({
        parent_id: row.parent_id,
        child_id: targetPersonId,
        relationship_type: 'biological',
        confirmed: false,
      })
      if (error) throw error
    }

  } else if (type === 'spouse') {
    const { error } = await supabase.from('marriages').insert({
      person_a_id: props.personId,
      person_b_id: targetPersonId,
      marriage_date: null,
      marriage_place: null,
      end_date: null,
      end_reason: null,
    })
    if (error) throw error
  }
}

// ─── Actions ───────────────────────────────────────────────────────────────

async function linkPerson(index: number) {
  const state = states[index]
  if (!state || !state.matchedPerson) return
  const suggestion = props.suggestions[index]
  if (!suggestion) return

  state.status = 'linking'
  state.errorMessage = null
  try {
    await performLink(suggestion.relationshipType, state.matchedPerson.id)
    state.status = 'linked'
  } catch (err) {
    state.status = 'error'
    state.errorMessage = err instanceof Error ? err.message : 'Failed to link relationship'
  }
}

function showCreateForm(index: number) {
  const state = states[index]
  if (!state) return
  state.status = 'creating'
  state.newFirstName = ''
  state.newLastName = ''
  state.newBirthDate = ''
  state.errorMessage = null
}

function cancelCreate(index: number) {
  const state = states[index]
  if (!state) return
  state.status = 'pending'
}

async function submitCreateAndLink(index: number) {
  const state = states[index]
  const suggestion = props.suggestions[index]
  if (!state || !suggestion) return
  if (!state.newFirstName.trim() || !state.newLastName.trim()) return

  state.status = 'linking'
  state.errorMessage = null
  try {
    const { data: newPerson, error: insertError } = await supabase
      .from('people')
      .insert({
        first_name: state.newFirstName.trim(),
        last_name: state.newLastName.trim(),
        birth_surname: null,
        nickname: null,
        name_variants: [],
        suffix: null,
        birth_date: state.newBirthDate.trim() || null,
        birth_place: null,
        death_date: null,
        death_place: null,
        burial_place: null,
        notes: null,
        biography: null,
      })
      .select()
      .single()

    if (insertError || !newPerson) throw insertError ?? new Error('Person not created')

    state.matchedPerson = {
      id: newPerson.id,
      firstName: newPerson.first_name,
      lastName: newPerson.last_name,
      birthSurname: newPerson.birth_surname,
      nickname: newPerson.nickname,
      birthDate: newPerson.birth_date,
      deathDate: newPerson.death_date,
      primaryPhotoId: newPerson.primary_photo_id,
    }

    await performLink(suggestion.relationshipType, newPerson.id)
    state.status = 'linked'
  } catch (err) {
    state.status = 'error'
    state.errorMessage = err instanceof Error ? err.message : 'Failed to create and link person'
  }
}

function skipSuggestion(index: number) {
  const state = states[index]
  if (!state) return
  state.status = 'skipped'
}

// ─── Birth year helper ──────────────────────────────────────────────────────

function birthYear(person: PersonSummary): string {
  if (!person.birthDate) return '?'
  return String(new Date(person.birthDate).getFullYear())
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="suggestions.length === 0" class="text-sm text-walnut-muted italic">
      No relationship suggestions from this document.
    </div>

    <template v-for="(suggestion, i) in suggestions" :key="i">
      <div
        v-if="states[i]"
        class="border rounded-lg p-4 transition-colors"
        :class="{
          'border-parchment bg-white':                states[i]!.status === 'pending' || states[i]!.status === 'creating' || states[i]!.status === 'linking',
          'border-green-300 bg-green-50':             states[i]!.status === 'linked',
          'border-stone-200 bg-stone-50 opacity-60':  states[i]!.status === 'skipped',
          'border-red-300 bg-red-50':                 states[i]!.status === 'error',
        }"
      >
        <!-- Header: badge + name + uncertain indicator -->
        <div class="flex items-center flex-wrap gap-2 mb-2">
          <span :class="badgeClass(suggestion.relationshipType)">
            {{ badgeLabel(suggestion.relationshipType) }}
          </span>
          <span class="font-display font-semibold text-walnut">{{ suggestion.mentionedName }}</span>
          <span
            v-if="suggestion.uncertain"
            class="text-xs text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded border border-yellow-300"
            title="The AI was uncertain about this relationship"
          >
            uncertain
          </span>

          <!-- Linked confirmation -->
          <span
            v-if="states[i]!.status === 'linked'"
            class="ml-auto flex items-center gap-1 text-green-700 text-sm font-medium"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Linked {{ states[i]!.matchedPerson?.firstName ?? '' }} {{ states[i]!.matchedPerson?.lastName ?? '' }}
          </span>

          <!-- Skipped indicator -->
          <span v-if="states[i]!.status === 'skipped'" class="ml-auto text-stone-400 text-sm">
            &#x2715; Skipped
          </span>
        </div>

        <!-- Context quote -->
        <p class="text-sm italic text-walnut-muted mb-3">"{{ suggestion.mentionContext }}"</p>

        <!-- Match section (only while not resolved) -->
        <div
          v-if="states[i]!.status !== 'linked' && states[i]!.status !== 'skipped'"
          class="mb-3"
        >
          <template v-if="states[i]!.matchedPerson">
            <p class="text-xs text-walnut-muted mb-1 font-medium uppercase tracking-wide">Matched in family records</p>
            <div class="flex items-center gap-3 border border-parchment rounded-lg px-3 py-2 bg-cream">
              <div class="w-8 h-8 rounded-full bg-parchment border border-walnut/20 flex items-center justify-center flex-shrink-0">
                <span class="font-display text-walnut text-xs">
                  {{ states[i]!.matchedPerson!.firstName[0] }}{{ states[i]!.matchedPerson!.lastName[0] }}
                </span>
              </div>
              <div>
                <p class="font-display text-walnut text-sm font-medium">
                  {{ states[i]!.matchedPerson!.firstName }}
                  <span v-if="states[i]!.matchedPerson!.nickname" class="text-walnut-muted font-normal">
                    "{{ states[i]!.matchedPerson!.nickname }}"
                  </span>
                  {{ states[i]!.matchedPerson!.lastName }}
                  <span v-if="states[i]!.matchedPerson!.birthSurname" class="text-walnut-muted font-normal text-xs">
                    (née {{ states[i]!.matchedPerson!.birthSurname }})
                  </span>
                </p>
                <p class="text-walnut-muted text-xs">b. {{ birthYear(states[i]!.matchedPerson!) }}</p>
              </div>
            </div>
          </template>
          <template v-else>
            <p class="text-xs text-walnut-muted italic">No match found in family records.</p>
          </template>
        </div>

        <!-- Error message -->
        <p v-if="states[i]!.status === 'error' && states[i]!.errorMessage" class="error-text mb-3">
          {{ states[i]!.errorMessage }}
        </p>

        <!-- Inline create form -->
        <div
          v-if="states[i]!.status === 'creating'"
          class="border border-parchment rounded-lg p-3 bg-parchment/10 mb-3 space-y-3"
        >
          <p class="text-sm font-medium text-walnut">Create new person</p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">First Name <span class="text-red-500">*</span></label>
              <input
                v-model="states[i]!.newFirstName"
                type="text"
                class="form-input"
                placeholder="First name"
              />
            </div>
            <div>
              <label class="form-label">Last Name <span class="text-red-500">*</span></label>
              <input
                v-model="states[i]!.newLastName"
                type="text"
                class="form-input"
                placeholder="Last name"
              />
            </div>
            <div class="col-span-2">
              <label class="form-label">Birth Date (optional)</label>
              <input
                v-model="states[i]!.newBirthDate"
                type="date"
                class="form-input"
              />
            </div>
          </div>
          <div class="flex gap-2 justify-end">
            <button type="button" class="btn-ghost text-sm" @click="cancelCreate(i)">Cancel</button>
            <button
              type="button"
              class="btn-primary text-sm"
              :disabled="!states[i]!.newFirstName.trim() || !states[i]!.newLastName.trim()"
              @click="submitCreateAndLink(i)"
            >
              Create &amp; Link
            </button>
          </div>
        </div>

        <!-- Action buttons -->
        <div
          v-if="states[i]!.status === 'pending' || states[i]!.status === 'error'"
          class="flex flex-wrap gap-2"
        >
          <button
            v-if="states[i]!.matchedPerson"
            type="button"
            class="btn-primary text-sm"
            @click="linkPerson(i)"
          >
            Link {{ states[i]!.matchedPerson!.firstName }}
          </button>
          <button
            type="button"
            class="btn-secondary text-sm"
            @click="showCreateForm(i)"
          >
            Create new person
          </button>
          <button
            type="button"
            class="btn-ghost text-sm"
            @click="skipSuggestion(i)"
          >
            Skip
          </button>
        </div>

        <!-- Linking spinner -->
        <div v-if="states[i]!.status === 'linking'" class="flex items-center gap-2 text-sm text-walnut-muted">
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Linking…
        </div>
      </div>
    </template>
  </div>
</template>
