<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

function proceed() {
  router.push({ name: 'tree' })
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-lg">
      <div class="card p-8">
        <h2 class="font-display text-2xl text-walnut mb-2">
          Welcome, {{ auth.profile?.firstName }}!
        </h2>
        <p class="text-walnut-muted text-sm mb-6 leading-relaxed">
          Let's find your record in the family tree so we can personalise your experience.
        </p>

        <!-- Phase 2: name-matching search goes here -->
        <div class="bg-cream border border-parchment rounded p-4 text-sm text-walnut-muted mb-6">
          Person matching will be available once family records have been added (Phase 2).
        </div>

        <button @click="proceed" class="btn-primary w-full">
          Continue to family tree
        </button>
      </div>
    </div>
  </div>
</template>
