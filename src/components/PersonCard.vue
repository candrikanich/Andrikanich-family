<script setup lang="ts">
import { computed } from 'vue'
import type { PersonSummary } from '@/types'

const props = defineProps<{ person: PersonSummary }>()

const lifespan = computed(() => {
  const birth = props.person.birthDate ? new Date(props.person.birthDate).getFullYear() : '?'
  if (!props.person.deathDate) return `b. ${birth}`
  const death = new Date(props.person.deathDate).getFullYear()
  return `${birth} – ${death}`
})
</script>

<template>
  <RouterLink :to="{ name: 'person', params: { id: person.id } }" class="block group">
    <div class="card p-4 hover:shadow-md transition-shadow cursor-pointer">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-parchment border border-walnut/20 flex items-center justify-center flex-shrink-0">
          <span class="font-display text-walnut text-sm">{{ person.firstName[0] }}{{ person.lastName[0] }}</span>
        </div>
        <div class="min-w-0">
          <p class="font-display text-walnut font-medium truncate group-hover:text-walnut/80">
            {{ person.firstName }}
            <span v-if="person.nickname" class="text-walnut-muted font-normal">"{{ person.nickname }}"</span>
            {{ person.lastName }}
            <span v-if="person.birthSurname" class="text-walnut-muted text-sm font-normal">(née {{ person.birthSurname }})</span>
          </p>
          <p class="text-walnut-muted text-xs">{{ lifespan }}</p>
        </div>
      </div>
    </div>
  </RouterLink>
</template>
