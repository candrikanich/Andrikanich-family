<script setup lang="ts">
import { onMounted } from 'vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()

onMounted(() => admin.fetchPending())

async function approve(id: string) {
  try { await admin.approve(id) } catch { /* error handled in store */ }
}
async function deny(id: string) {
  try { await admin.deny(id) } catch { /* error handled in store */ }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-10">
    <div class="flex items-center gap-4 mb-8">
      <RouterLink to="/admin" class="btn-ghost text-sm">← Admin</RouterLink>
      <h1 class="font-display text-3xl text-walnut">Pending Approvals</h1>
    </div>

    <div v-if="admin.isLoading" class="text-walnut-muted">Loading…</div>
    <p v-else-if="admin.error" class="error-text">{{ admin.error }}</p>

    <div v-else-if="admin.pendingProfiles.length === 0" class="card p-8 text-center text-walnut-muted">
      No pending registrations
    </div>

    <ul v-else class="space-y-3">
      <li
        v-for="p in admin.pendingProfiles"
        :key="p.id"
        class="card p-5 flex items-center justify-between gap-4"
      >
        <div>
          <p class="font-medium text-walnut">{{ p.firstName }} {{ p.lastName }}</p>
          <p class="text-sm text-walnut-muted">{{ p.email }}</p>
          <p class="text-xs text-walnut-muted mt-0.5">
            Registered {{ new Date(p.createdAt).toLocaleDateString() }}
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button @click="approve(p.id)" class="btn-primary text-sm py-1.5 px-4">Approve</button>
          <button @click="deny(p.id)"   class="btn-secondary text-sm py-1.5 px-4">Deny</button>
        </div>
      </li>
    </ul>
  </div>
</template>
