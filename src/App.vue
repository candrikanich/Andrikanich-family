<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(() => {
  authStore.checkAuth()
})
</script>

<template>
  <div id="app" class="min-h-screen flex flex-col bg-gray-50">
    <header class="bg-white shadow">
      <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex justify-between items-center">
          <h1 class="text-2xl font-bold text-primary">Genealogy Tracker</h1>
          <div v-if="authStore.isAuthenticated" class="flex items-center gap-4">
            <span class="text-sm text-gray-600">{{ authStore.user?.firstName }} {{ authStore.user?.lastName }}</span>
            <button
              @click="authStore.logout"
              class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
          <div v-else class="flex gap-2">
            <a href="/login" class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
              Login
            </a>
            <a href="/signup" class="px-3 py-2 text-sm font-medium bg-primary text-white rounded hover:bg-primary-light">
              Sign Up
            </a>
          </div>
        </div>
      </nav>
    </header>

    <main class="flex-1 max-w-7xl w-full mx-auto py-8 px-4">
      <!-- Main content will go here -->
      <div class="text-center">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">Welcome to Genealogy Tracker</h2>
        <p class="text-gray-600 mb-8">Organize and share your family history</p>
        <div v-if="!authStore.isAuthenticated" class="space-y-4">
          <p class="text-gray-700 mb-6">Get started by signing up or logging in</p>
          <div class="flex justify-center gap-4">
            <a
              href="/signup"
              class="inline-block px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-light transition"
            >
              Create Account
            </a>
            <a
              href="/login"
              class="inline-block px-6 py-3 border border-primary text-primary rounded-lg hover:bg-primary hover:text-white transition"
            >
              Login
            </a>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
