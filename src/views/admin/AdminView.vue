<script setup lang="ts">
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-10">
    <h1 class="font-display text-3xl text-walnut mb-8">Admin Panel</h1>
    <div class="grid gap-4 sm:grid-cols-2">
      <RouterLink to="/admin/approvals" class="card p-6 hover:border-walnut-muted transition-colors block">
        <h2 class="font-display text-lg text-walnut mb-1">Pending Approvals</h2>
        <p class="text-sm text-walnut-muted">Review and approve new family member registrations</p>
      </RouterLink>
      <RouterLink to="/import/gedcom" class="card p-6 hover:border-walnut-muted transition-colors block">
        <h2 class="font-display text-lg text-walnut mb-1">Import GEDCOM</h2>
        <p class="text-sm text-walnut-muted">Bulk-import people and relationships from a .ged file</p>
      </RouterLink>
    </div>
  </div>
</template>
