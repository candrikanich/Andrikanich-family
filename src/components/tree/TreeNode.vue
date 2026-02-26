<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { TreePerson } from '@/types'

const props = defineProps<{
  data: { person: TreePerson; isRoot: boolean }
}>()

function lifespan(p: TreePerson): string {
  const birth = p.birthDate ? new Date(p.birthDate).getFullYear() : '?'
  if (!p.deathDate) return String(birth)
  const death = new Date(p.deathDate).getFullYear()
  return `${birth} – ${death}`
}

function displayName(p: TreePerson): string {
  if (p.nickname) return `${p.firstName} "${p.nickname}" ${p.lastName}`
  return `${p.firstName} ${p.lastName}`
}
</script>

<template>
  <div
    class="tree-node"
    :class="{
      'tree-node--root': data.isRoot,
      'tree-node--deceased': !!data.person.deathDate,
    }"
  >
    <Handle type="target" :position="Position.Top" class="tree-handle" />

    <!-- Photo placeholder -->
    <div class="tree-node__photo">
      <span class="tree-node__initials">
        {{ data.person.firstName[0] }}{{ data.person.lastName[0] }}
      </span>
    </div>

    <!-- Name and dates -->
    <div class="tree-node__info">
      <p class="tree-node__name">{{ displayName(data.person) }}</p>
      <p class="tree-node__dates">{{ lifespan(data.person) }}</p>
    </div>

    <Handle type="source" :position="Position.Bottom" class="tree-handle" />
  </div>
</template>

<style scoped>
.tree-node {
  width: 180px;
  padding: 10px 12px;
  background: #FDFAF5;
  border: 1.5px solid #D4C5A9;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(61, 43, 31, 0.08);
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.tree-node:hover {
  box-shadow: 0 4px 12px rgba(61, 43, 31, 0.15);
  transform: translateY(-1px);
}
.tree-node--root {
  border-color: #C4856A;
  border-width: 2px;
  background: #FEF6F0;
}
.tree-node--deceased {
  opacity: 0.75;
}
.tree-node__photo {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #D4C5A9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.tree-node__initials {
  font-size: 12px;
  font-weight: 600;
  color: #3D2B1F;
  font-family: 'Playfair Display', Georgia, serif;
}
.tree-node__info {
  min-width: 0;
}
.tree-node__name {
  font-size: 12px;
  font-weight: 600;
  color: #3D2B1F;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Playfair Display', Georgia, serif;
  line-height: 1.3;
}
.tree-node__dates {
  font-size: 11px;
  color: #8B6F5E;
  margin-top: 2px;
}
.tree-handle {
  opacity: 0;
  pointer-events: none;
}
</style>
