<script setup lang="ts">
import { onMounted } from 'vue'
import { usePersonDetail } from '@/composables/usePersonDetail'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  personId: string
}>()

const emit = defineEmits<{
  navigate: [personId: string]
  close: []
}>()

const auth   = useAuthStore()
const detail = usePersonDetail(props.personId)

onMounted(() => detail.load())

function formatYear(d: string | null): string | null {
  if (!d) return null
  return String(new Date(d).getFullYear())
}

function fullName(p: { firstName: string; lastName: string; nickname?: string | null }): string {
  if (p.nickname) return `${p.firstName} "${p.nickname}" ${p.lastName}`
  return `${p.firstName} ${p.lastName}`
}
</script>

<template>
  <!-- Backdrop -->
  <div class="slide-over__backdrop" @click="emit('close')" />

  <!-- Panel -->
  <div class="slide-over__panel">
    <!-- Header -->
    <div class="flex items-center justify-between mb-5">
      <h2 class="font-display text-xl text-walnut truncate pr-4">
        {{ detail.person.value ? fullName(detail.person.value) : '…' }}
      </h2>
      <button @click="emit('close')" class="text-walnut-muted hover:text-walnut transition-colors p-1 flex-shrink-0">
        ✕
      </button>
    </div>

    <div v-if="detail.isLoading.value" class="text-walnut-muted text-sm text-center py-8">Loading…</div>
    <div v-else-if="detail.error.value" class="text-red-600 text-sm py-4">{{ detail.error.value }}</div>

    <template v-else-if="detail.person.value">
      <!-- Vital dates -->
      <div class="text-sm text-walnut-muted space-y-1 mb-5">
        <p v-if="detail.person.value.birthDate || detail.person.value.birthPlace">
          <span class="text-walnut font-medium">Born</span>
          {{ [formatYear(detail.person.value.birthDate), detail.person.value.birthPlace].filter(Boolean).join(' · ') }}
        </p>
        <p v-if="detail.person.value.deathDate || detail.person.value.deathPlace">
          <span class="text-walnut font-medium">Died</span>
          {{ [formatYear(detail.person.value.deathDate), detail.person.value.deathPlace].filter(Boolean).join(' · ') }}
        </p>
      </div>

      <hr class="border-parchment mb-4" />

      <!-- Parents -->
      <div v-if="detail.parents.value.length" class="mb-4">
        <p class="text-xs font-medium text-walnut-muted uppercase tracking-wide mb-2">Parents</p>
        <div class="space-y-1">
          <button
            v-for="{ person: p } in detail.parents.value"
            :key="p.id"
            @click="emit('navigate', p.id)"
            class="block text-sm text-walnut hover:text-walnut-light hover:underline transition-colors"
          >
            {{ fullName(p) }}
          </button>
        </div>
      </div>

      <!-- Spouses -->
      <div v-if="detail.spouses.value.length" class="mb-4">
        <p class="text-xs font-medium text-walnut-muted uppercase tracking-wide mb-2">
          {{ detail.spouses.value.length === 1 ? 'Spouse' : 'Spouses' }}
        </p>
        <div class="space-y-1">
          <button
            v-for="{ person: p, marriage: m } in detail.spouses.value"
            :key="p.id"
            @click="emit('navigate', p.id)"
            class="block text-sm text-walnut hover:text-walnut-light hover:underline transition-colors"
          >
            {{ fullName(p) }}
            <span v-if="m.marriageDate" class="text-walnut-muted">
              (m. {{ formatYear(m.marriageDate) }})
            </span>
          </button>
        </div>
      </div>

      <!-- Children -->
      <div v-if="detail.children.value.length" class="mb-5">
        <p class="text-xs font-medium text-walnut-muted uppercase tracking-wide mb-2">Children</p>
        <div class="space-y-1">
          <button
            v-for="{ person: p } in detail.children.value"
            :key="p.id"
            @click="emit('navigate', p.id)"
            class="block text-sm text-walnut hover:text-walnut-light hover:underline transition-colors"
          >
            {{ fullName(p) }}
          </button>
        </div>
      </div>

      <hr class="border-parchment mb-4" />

      <!-- Actions -->
      <div class="flex gap-2">
        <RouterLink
          :to="{ name: 'person', params: { id: personId } }"
          class="btn-primary text-sm flex-1 text-center"
        >
          View Full Profile
        </RouterLink>
        <RouterLink
          v-if="auth.isEditor"
          :to="{ name: 'person', params: { id: personId } }"
          class="btn-secondary text-sm"
        >
          Edit
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.slide-over__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(61, 43, 31, 0.15);
  z-index: 49;
}
.slide-over__panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 340px;
  height: 100%;
  background: #FDFAF5;
  border-left: 1px solid #D4C5A9;
  padding: 24px 20px;
  overflow-y: auto;
  box-shadow: -4px 0 20px rgba(61, 43, 31, 0.1);
  z-index: 50;
}
</style>
