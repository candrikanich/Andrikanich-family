<script setup lang="ts">
import { ref, computed } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePeopleStore } from '@/stores/people'
import type { RelatedParent, RelatedChild, RelatedSpouse } from '@/composables/usePersonDetail'
import type { RelationshipType, MarriageEndReason, PersonSummary } from '@/types'

const props = defineProps<{
  personId: string
  parents: RelatedParent[]
  children: RelatedChild[]
  spouses: RelatedSpouse[]
}>()

const emit = defineEmits<{ reload: [] }>()

const auth   = useAuthStore()
const people = usePeopleStore()

type Tab = 'parents' | 'children' | 'spouses'
const activeTab  = ref<Tab>('parents')
const showPicker = ref(false)
const pickerQuery = ref('')

const pickerResults = computed(() =>
  people.list
    .filter(p =>
      p.id !== props.personId &&
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(pickerQuery.value.toLowerCase())
    )
    .slice(0, 8)
)

// Add form state
const addRelType     = ref<RelationshipType>('biological')
const addMarriageDate  = ref('')
const addMarriagePlace = ref('')
const addEndReason   = ref<MarriageEndReason | ''>('')

async function openPicker() {
  if (people.list.length === 0) await people.fetchPeople()
  pickerQuery.value = ''
  showPicker.value = true
}

function switchTab(tab: Tab) {
  activeTab.value = tab
  showPicker.value = false
}

async function addParent(parent: PersonSummary) {
  await supabase.from('parent_child').insert({
    parent_id: parent.id,
    child_id: props.personId,
    relationship_type: addRelType.value,
    confirmed: true,
  })
  showPicker.value = false
  emit('reload')
}

async function addChild(child: PersonSummary) {
  await supabase.from('parent_child').insert({
    parent_id: props.personId,
    child_id: child.id,
    relationship_type: addRelType.value,
    confirmed: true,
  })
  showPicker.value = false
  emit('reload')
}

async function addSpouse(spouse: PersonSummary) {
  await supabase.from('marriages').insert({
    person_a_id: props.personId,
    person_b_id: spouse.id,
    marriage_date: addMarriageDate.value || null,
    marriage_place: addMarriagePlace.value || null,
    end_reason: (addEndReason.value as MarriageEndReason) || null,
    end_date: null,
  })
  showPicker.value = false
  emit('reload')
}

async function removeRelationship(id: string) {
  await supabase.from('parent_child').delete().eq('id', id)
  emit('reload')
}

async function removeMarriage(id: string) {
  await supabase.from('marriages').delete().eq('id', id)
  emit('reload')
}

function displayName(p: PersonSummary) {
  const year = p.birthDate ? new Date(p.birthDate).getFullYear() : null
  return year ? `${p.firstName} ${p.lastName} (b. ${year})` : `${p.firstName} ${p.lastName}`
}
</script>

<template>
  <div class="card p-6">
    <h3 class="font-display text-lg text-walnut mb-4">Relationships</h3>

    <!-- Tabs -->
    <div class="flex gap-0 mb-5 border-b border-parchment">
      <button
        v-for="tab in (['parents', 'children', 'spouses'] as Tab[])"
        :key="tab"
        @click="switchTab(tab)"
        class="px-4 py-2 text-sm capitalize transition-colors -mb-px"
        :class="activeTab === tab
          ? 'border-b-2 border-walnut text-walnut font-medium'
          : 'text-walnut-muted hover:text-walnut border-b-2 border-transparent'"
      >
        {{ tab }}
        <span class="ml-1 text-xs opacity-60">
          ({{ tab === 'parents' ? parents.length : tab === 'children' ? children.length : spouses.length }})
        </span>
      </button>
    </div>

    <!-- Parents tab -->
    <div v-if="activeTab === 'parents'" class="space-y-2 min-h-[2rem]">
      <div
        v-for="{ person, relationship } in parents"
        :key="relationship.id"
        class="flex items-center justify-between py-1.5"
      >
        <div>
          <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="text-walnut hover:underline text-sm">
            {{ displayName(person) }}
          </RouterLink>
          <span class="ml-2 text-xs text-walnut-muted capitalize">{{ relationship.relationshipType }}</span>
          <span v-if="!relationship.confirmed" class="ml-1 text-xs text-amber-600">(unconfirmed)</span>
        </div>
        <button
          v-if="auth.isEditor"
          @click="removeRelationship(relationship.id)"
          class="text-xs text-walnut-muted hover:text-red-600 transition-colors ml-4"
        >
          Remove
        </button>
      </div>
      <p v-if="parents.length === 0" class="text-walnut-muted text-sm">No parents linked.</p>
    </div>

    <!-- Children tab -->
    <div v-else-if="activeTab === 'children'" class="space-y-2 min-h-[2rem]">
      <div
        v-for="{ person, relationship } in children"
        :key="relationship.id"
        class="flex items-center justify-between py-1.5"
      >
        <div>
          <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="text-walnut hover:underline text-sm">
            {{ displayName(person) }}
          </RouterLink>
          <span class="ml-2 text-xs text-walnut-muted capitalize">{{ relationship.relationshipType }}</span>
          <span v-if="!relationship.confirmed" class="ml-1 text-xs text-amber-600">(unconfirmed)</span>
        </div>
        <button
          v-if="auth.isEditor"
          @click="removeRelationship(relationship.id)"
          class="text-xs text-walnut-muted hover:text-red-600 transition-colors ml-4"
        >
          Remove
        </button>
      </div>
      <p v-if="children.length === 0" class="text-walnut-muted text-sm">No children linked.</p>
    </div>

    <!-- Spouses tab -->
    <div v-else class="space-y-2 min-h-[2rem]">
      <div
        v-for="{ person, marriage } in spouses"
        :key="marriage.id"
        class="flex items-center justify-between py-1.5"
      >
        <div>
          <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="text-walnut hover:underline text-sm">
            {{ displayName(person) }}
          </RouterLink>
          <span v-if="marriage.marriageDate" class="ml-2 text-xs text-walnut-muted">
            m. {{ new Date(marriage.marriageDate).getFullYear() }}
          </span>
          <span v-if="marriage.marriagePlace" class="ml-1 text-xs text-walnut-muted">· {{ marriage.marriagePlace }}</span>
          <span v-if="marriage.endReason" class="ml-1 text-xs text-walnut-muted capitalize">({{ marriage.endReason }})</span>
        </div>
        <button
          v-if="auth.isEditor"
          @click="removeMarriage(marriage.id)"
          class="text-xs text-walnut-muted hover:text-red-600 transition-colors ml-4"
        >
          Remove
        </button>
      </div>
      <p v-if="spouses.length === 0" class="text-walnut-muted text-sm">No spouses linked.</p>
    </div>

    <!-- Add button + picker (editor only) -->
    <div v-if="auth.isEditor" class="mt-4">
      <button
        v-if="!showPicker"
        @click="openPicker"
        class="text-sm text-walnut-muted hover:text-walnut transition-colors"
      >
        + Add {{ activeTab === 'parents' ? 'parent' : activeTab === 'children' ? 'child' : 'spouse' }}
      </button>

      <div v-else class="space-y-3 border-t border-parchment pt-4 mt-2">
        <!-- Relationship type (parents + children only) -->
        <div v-if="activeTab !== 'spouses'">
          <label class="block text-xs text-walnut-muted mb-1">Relationship type</label>
          <select v-model="addRelType" class="input text-sm">
            <option value="biological">Biological</option>
            <option value="adopted">Adopted</option>
            <option value="step">Step</option>
            <option value="half">Half</option>
          </select>
        </div>

        <!-- Marriage fields (spouses only) -->
        <div v-if="activeTab === 'spouses'" class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-xs text-walnut-muted mb-1">Marriage date</label>
            <input v-model="addMarriageDate" type="date" class="input text-sm w-full" />
          </div>
          <div>
            <label class="block text-xs text-walnut-muted mb-1">Marriage place</label>
            <input v-model="addMarriagePlace" class="input text-sm w-full" placeholder="City, State" />
          </div>
          <div>
            <label class="block text-xs text-walnut-muted mb-1">Status</label>
            <select v-model="addEndReason" class="input text-sm w-full">
              <option value="">Still married</option>
              <option value="divorced">Divorced</option>
              <option value="widowed">Widowed</option>
              <option value="annulled">Annulled</option>
            </select>
          </div>
        </div>

        <!-- Person search -->
        <div>
          <label class="block text-xs text-walnut-muted mb-1">Search by name</label>
          <input v-model="pickerQuery" class="input w-full text-sm" placeholder="Type a name…" autofocus />
        </div>

        <div class="space-y-1 max-h-48 overflow-y-auto rounded border border-parchment">
          <button
            v-for="p in pickerResults"
            :key="p.id"
            @click="activeTab === 'parents' ? addParent(p) : activeTab === 'children' ? addChild(p) : addSpouse(p)"
            class="w-full text-left px-3 py-2 text-sm text-walnut hover:bg-parchment transition-colors"
          >
            {{ displayName(p) }}
          </button>
          <p v-if="pickerResults.length === 0 && pickerQuery.trim()" class="text-walnut-muted text-sm px-3 py-2">
            No matches for "{{ pickerQuery }}"
          </p>
          <p v-else-if="pickerResults.length === 0" class="text-walnut-muted text-sm px-3 py-2">
            Type a name to search…
          </p>
        </div>

        <button @click="showPicker = false" class="text-xs text-walnut-muted hover:text-walnut transition-colors">
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
