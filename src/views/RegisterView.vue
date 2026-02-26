<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const firstName = ref('')
const lastName  = ref('')
const email     = ref('')
const password  = ref('')
const confirm   = ref('')
const registered = ref(false)
const passwordMismatch = ref(false)

async function handleRegister() {
  passwordMismatch.value = false
  if (password.value !== confirm.value) {
    passwordMismatch.value = true
    return
  }
  try {
    await auth.register(email.value, password.value, firstName.value, lastName.value)
    registered.value = true
  } catch {
    // auth.error is set
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

      <!-- Post-registration confirmation -->
      <div v-if="registered" class="card p-8 text-center">
        <div class="text-4xl mb-4">📬</div>
        <h2 class="font-display text-2xl text-walnut mb-3">Request received</h2>
        <p class="text-walnut-muted text-sm leading-relaxed">
          Your account is pending approval. The site admin will review your request
          and you'll be able to sign in once approved.
        </p>
        <RouterLink to="/login" class="btn-secondary inline-block mt-6">Back to sign in</RouterLink>
      </div>

      <!-- Registration form -->
      <div v-else class="card p-8">
        <h2 class="font-display text-2xl text-walnut mb-2">Create account</h2>
        <p class="text-sm text-walnut-muted mb-6">
          Already have a link to this site? Register below — the admin will approve your access.
        </p>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="firstName" class="form-label">First name</label>
              <input id="firstName" v-model="firstName" type="text" required class="form-input" />
            </div>
            <div>
              <label for="lastName" class="form-label">Last name</label>
              <input id="lastName" v-model="lastName" type="text" required class="form-input" />
            </div>
          </div>

          <div>
            <label for="email" class="form-label">Email address</label>
            <input id="email" v-model="email" type="email" required autocomplete="email" class="form-input" />
          </div>

          <div>
            <label for="password" class="form-label">Password</label>
            <input id="password" v-model="password" type="password" required minlength="8" class="form-input" />
          </div>

          <div>
            <label for="confirm" class="form-label">Confirm password</label>
            <input id="confirm" v-model="confirm" type="password" required class="form-input" />
            <p v-if="passwordMismatch" class="error-text">Passwords do not match</p>
          </div>

          <p v-if="auth.error" class="error-text">{{ auth.error }}</p>

          <button type="submit" :disabled="auth.isLoading" class="btn-primary w-full mt-2">
            {{ auth.isLoading ? 'Creating account…' : 'Create account' }}
          </button>
        </form>

        <p class="text-center text-sm text-walnut-muted mt-6">
          Already have an account?
          <RouterLink to="/login" class="text-walnut hover:underline font-medium">Sign in</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
