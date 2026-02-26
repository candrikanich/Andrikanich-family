<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Person, PersonInput } from '@/types'

const props = defineProps<{
  isOpen: boolean
  person?: Person | null
}>()

const emit = defineEmits<{
  save: [input: PersonInput]
  close: []
}>()

const form = ref<PersonInput>({
  firstName: '',
  lastName: '',
  birthSurname: null,
  nickname: null,
  nameVariants: [],
  suffix: null,
  birthDate: null,
  birthPlace: null,
  deathDate: null,
  deathPlace: null,
  burialPlace: null,
  notes: null,
  biography: null,
})

watch(() => props.isOpen, (open) => {
  if (!open) return
  if (props.person) {
    form.value = {
      firstName:    props.person.firstName,
      lastName:     props.person.lastName,
      birthSurname: props.person.birthSurname,
      nickname:     props.person.nickname,
      nameVariants: props.person.nameVariants,
      suffix:       props.person.suffix,
      birthDate:    props.person.birthDate,
      birthPlace:   props.person.birthPlace,
      deathDate:    props.person.deathDate,
      deathPlace:   props.person.deathPlace,
      burialPlace:  props.person.burialPlace,
      notes:        props.person.notes,
      biography:    props.person.biography,
    }
  } else {
    form.value = {
      firstName: '', lastName: '', birthSurname: null, nickname: null,
      nameVariants: [], suffix: null, birthDate: null, birthPlace: null,
      deathDate: null, deathPlace: null, burialPlace: null, notes: null, biography: null,
    }
  }
})

function submit() {
  emit('save', { ...form.value })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-walnut/40" @click.self="emit('close')">
        <div class="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8">
          <div class="flex items-center justify-between mb-6">
            <h2 class="font-display text-2xl text-walnut">
              {{ person ? 'Edit Person' : 'Add Person' }}
            </h2>
            <button @click="emit('close')" class="text-walnut-muted hover:text-walnut transition-colors text-xl leading-none">×</button>
          </div>

          <form @submit.prevent="submit" class="space-y-5">
            <!-- Name -->
            <fieldset class="space-y-3">
              <legend class="text-xs uppercase tracking-widest text-walnut-muted font-medium">Name</legend>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm text-walnut mb-1">First name <span class="text-walnut-muted">*</span></label>
                  <input v-model="form.firstName" required class="input w-full" placeholder="First name" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Last name <span class="text-walnut-muted">*</span></label>
                  <input v-model="form.lastName" required class="input w-full" placeholder="Last name" />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="block text-sm text-walnut mb-1">Birth surname</label>
                  <input v-model="form.birthSurname" class="input w-full" placeholder="Maiden name" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Nickname</label>
                  <input v-model="form.nickname" class="input w-full" placeholder="Known as" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Suffix</label>
                  <input v-model="form.suffix" class="input w-full" placeholder="Jr, Sr, III" />
                </div>
              </div>
            </fieldset>

            <!-- Birth -->
            <fieldset class="space-y-3">
              <legend class="text-xs uppercase tracking-widest text-walnut-muted font-medium">Birth</legend>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm text-walnut mb-1">Birth date</label>
                  <input v-model="form.birthDate" type="date" class="input w-full" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Birth place</label>
                  <input v-model="form.birthPlace" class="input w-full" placeholder="City, State" />
                </div>
              </div>
            </fieldset>

            <!-- Death -->
            <fieldset class="space-y-3">
              <legend class="text-xs uppercase tracking-widest text-walnut-muted font-medium">Death</legend>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="block text-sm text-walnut mb-1">Death date</label>
                  <input v-model="form.deathDate" type="date" class="input w-full" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Death place</label>
                  <input v-model="form.deathPlace" class="input w-full" placeholder="City, State" />
                </div>
                <div>
                  <label class="block text-sm text-walnut mb-1">Burial place</label>
                  <input v-model="form.burialPlace" class="input w-full" placeholder="Cemetery, City" />
                </div>
              </div>
            </fieldset>

            <!-- Notes & Bio -->
            <div>
              <label class="block text-sm text-walnut mb-1">Notes / cross-references</label>
              <textarea v-model="form.notes" rows="2" class="input w-full resize-none"
                placeholder="Uncertainties, see references, etc." />
            </div>
            <div>
              <label class="block text-sm text-walnut mb-1">Biography</label>
              <textarea v-model="form.biography" rows="4" class="input w-full resize-none"
                placeholder="Narrative biography" />
            </div>

            <div class="flex gap-3 pt-2">
              <button type="submit" class="btn-primary flex-1">Save</button>
              <button type="button" @click="emit('close')" class="btn-secondary flex-1">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
