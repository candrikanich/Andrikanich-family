<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow } from '@vue-flow/core'
import type { NodeMouseEvent } from '@vue-flow/core'
import { useAuthStore } from '@/stores/auth'
import { usePeopleStore } from '@/stores/people'
import { useTreeStore } from '@/stores/tree'
import { buildTreeLayout } from '@/composables/useTreeLayout'
import TreeNode from '@/components/tree/TreeNode.vue'
import PersonSlideOver from '@/components/tree/PersonSlideOver.vue'

const route   = useRoute()
const router  = useRouter()
const auth    = useAuthStore()
const people  = usePeopleStore()
const tree    = useTreeStore()

const vueFlowRef = ref<InstanceType<typeof VueFlow> | null>(null)

// ── Root person ───────────────────────────────────────────────────────────────
const rootId = computed<string | null>(() => {
  const param = route.query.root
  if (typeof param === 'string' && param) return param
  return auth.profile?.personId ?? null
})

// ── Person picker (when no root is known) ────────────────────────────────────
const showPicker    = ref(false)
const pickerQuery   = ref('')
const pickerResults = computed(() =>
  people.list
    .filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(pickerQuery.value.toLowerCase()))
    .slice(0, 10)
)

async function openPicker() {
  if (people.list.length === 0) await people.fetchPeople()
  pickerQuery.value = ''
  showPicker.value  = true
}

function selectRoot(id: string) {
  showPicker.value = false
  router.replace({ name: 'tree', query: { root: id } })
}

// ── Layout ────────────────────────────────────────────────────────────────────
const nodes = ref<ReturnType<typeof buildTreeLayout>['nodes']>([])
const edges = ref<ReturnType<typeof buildTreeLayout>['edges']>([])

async function loadTree(id: string) {
  nodes.value = []
  edges.value = []
  try {
    await tree.fetchSubgraph(id)
    if (tree.subgraph) {
      const layout = buildTreeLayout(tree.subgraph)
      nodes.value = layout.nodes
      edges.value = layout.edges
      await nextTick()
      vueFlowRef.value?.fitView({ padding: 0.2 })
    }
  } catch {
    // tree.error is already set by the store
  }
}

// ── Slide-over ────────────────────────────────────────────────────────────────
const selectedPersonId = ref<string | null>(null)

function onNodeClick({ node }: NodeMouseEvent) {
  selectedPersonId.value = node.id
}

function navigateTo(personId: string) {
  selectedPersonId.value = null
  router.push({ name: 'tree', query: { root: personId } })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
watch(rootId, async (id) => {
  if (id) {
    selectedPersonId.value = null
    await loadTree(id)
  } else {
    await openPicker()
  }
}, { immediate: true })
</script>

<template>
  <div class="tree-view">
    <!-- Loading -->
    <div v-if="tree.isLoading" class="tree-view__status">
      <p class="text-walnut-muted">Loading family tree…</p>
    </div>

    <!-- Error -->
    <div v-else-if="tree.error" class="tree-view__status">
      <p class="text-red-600">{{ tree.error }}</p>
    </div>

    <!-- Tree canvas -->
    <VueFlow
      v-else-if="nodes.length"
      ref="vueFlowRef"
      :nodes="nodes"
      :edges="edges"
      :fit-view-on-init="true"
      :zoom-on-scroll="true"
      :pan-on-drag="true"
      :nodes-draggable="false"
      class="tree-canvas"
      @node-click="onNodeClick"
    >
      <template #node-person="nodeProps">
        <TreeNode v-bind="nodeProps" />
      </template>
    </VueFlow>

    <!-- Empty state -->
    <div v-else class="tree-view__status">
      <p class="text-walnut-muted mb-4">No tree data found.</p>
      <button class="btn-secondary" @click="openPicker">Choose a person</button>
    </div>

    <!-- Slide-over -->
    <Transition name="slide-over">
      <PersonSlideOver
        v-if="selectedPersonId"
        :key="selectedPersonId"
        :person-id="selectedPersonId"
        @navigate="navigateTo"
        @close="selectedPersonId = null"
      />
    </Transition>

    <!-- Person picker overlay -->
    <Transition name="fade">
      <div v-if="showPicker" class="picker-overlay">
        <div class="picker-modal card p-6">
          <h2 class="font-display text-xl text-walnut mb-4">Choose a starting person</h2>
          <input
            v-model="pickerQuery"
            class="input w-full mb-3"
            placeholder="Search by name…"
            autofocus
          />
          <div class="space-y-1 max-h-64 overflow-y-auto">
            <button
              v-for="p in pickerResults"
              :key="p.id"
              class="w-full text-left px-3 py-2 text-sm text-walnut hover:bg-parchment rounded transition-colors"
              @click="selectRoot(p.id)"
            >
              {{ p.firstName }} {{ p.lastName }}
              <span v-if="p.birthDate" class="text-walnut-muted ml-1 text-xs">
                (b. {{ new Date(p.birthDate).getFullYear() }})
              </span>
            </button>
            <p v-if="pickerResults.length === 0 && pickerQuery" class="text-walnut-muted text-sm px-3 py-2">
              No matches for "{{ pickerQuery }}"
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tree-view {
  width: 100%;
  height: calc(100vh - 64px);
  position: relative;
}
.tree-canvas {
  width: 100%;
  height: 100%;
  background: #F5F0E8;
}
.tree-view__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(61, 43, 31, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.picker-modal {
  width: 400px;
  max-width: calc(100vw - 32px);
}

/* Slide-over transition */
.slide-over-enter-active,
.slide-over-leave-active {
  transition: opacity 0.2s ease;
}
.slide-over-enter-active .slide-over__panel,
.slide-over-leave-active .slide-over__panel {
  transition: transform 0.25s ease;
}
.slide-over-enter-from,
.slide-over-leave-to {
  opacity: 0;
}
.slide-over-enter-from .slide-over__panel,
.slide-over-leave-to .slide-over__panel {
  transform: translateX(100%);
}

/* Picker fade transition */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
