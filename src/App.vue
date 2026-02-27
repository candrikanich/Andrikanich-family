<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const showNav = computed(() => auth.isAuthenticated && auth.isApproved)

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div id="app" class="min-h-screen flex flex-col bg-cream">
    <header v-if="showNav" class="bg-white border-b border-parchment shadow-sm">
      <nav class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <RouterLink to="/tree" class="font-display text-xl text-walnut font-semibold tracking-wide">
          Andrikanich Family
        </RouterLink>

        <div class="flex items-center gap-6">
          <RouterLink to="/tree"   class="text-sm text-walnut-muted hover:text-walnut transition-colors">Tree</RouterLink>
          <RouterLink to="/people" class="text-sm text-walnut-muted hover:text-walnut transition-colors">People</RouterLink>
          <RouterLink v-if="auth.isEditor" to="/upload" class="text-sm text-walnut-muted hover:text-walnut transition-colors">Upload Document</RouterLink>
          <RouterLink v-if="auth.isEditor" to="/import/gedcom" class="text-sm text-walnut-muted hover:text-walnut transition-colors">Import GEDCOM</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" class="text-sm text-walnut-muted hover:text-walnut transition-colors">Admin</RouterLink>

          <div class="flex items-center gap-3 pl-4 border-l border-parchment">
            <span class="text-sm text-walnut-muted">{{ auth.profile?.firstName }}</span>
            <button @click="handleLogout" class="btn-ghost text-sm">Sign out</button>
          </div>
        </div>
      </nav>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
