<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email    = ref('')
const password = ref('')

async function handleLogin() {
  try {
    const profile = await auth.login(email.value, password.value)
    if (profile.status === 'pending') {
      router.push({ name: 'pending' })
    } else if (!profile.personId) {
      router.push({ name: 'onboarding' })
    } else {
      const redirect = route.query.redirect as string | undefined
      router.push(redirect ?? { name: 'tree' })
    }
  } catch {
    // auth.error is set in the store
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-16 bg-cream">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="font-display text-4xl text-walnut mb-2">Andrikanich Family</h1>
        <p class="text-walnut-muted text-sm">Family history, preserved together</p>
      </div>

      <div class="card p-8">
        <h2 class="font-display text-2xl text-walnut mb-6">Sign in</h2>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label for="email" class="form-label">Email address</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              class="form-input"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label for="password" class="form-label">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              class="form-input"
              placeholder="••••••••"
            />
          </div>

          <p v-if="auth.error" class="error-text">{{ auth.error }}</p>

          <button type="submit" :disabled="auth.isLoading" class="btn-primary w-full mt-2">
            {{ auth.isLoading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="text-center text-sm text-walnut-muted mt-6">
          New family member?
          <RouterLink to="/register" class="text-walnut hover:underline font-medium">Create account</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
