<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-md text-center">
      <div class="card p-10">
        <div class="text-5xl mb-5">⏳</div>
        <h2 class="font-display text-2xl text-walnut mb-3">Awaiting approval</h2>
        <p class="text-walnut-muted text-sm leading-relaxed">
          Hi <strong>{{ auth.profile?.firstName }}</strong> — your account is pending review.
          The site admin will approve your access shortly.
        </p>
        <button @click="auth.logout()" class="btn-secondary mt-8">
          Sign out
        </button>
      </div>
    </div>
  </div>
</template>
