import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const isAuthenticated = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function signup(email: string, password: string, firstName: string, lastName: string) {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        }
      })

      if (signUpError) throw signUpError

      // Create user profile in users table
      if (data.user) {
        await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email,
          first_name: firstName,
          last_name: lastName,
          role: 'viewer'
        })
      }

      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Signup failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function login(email: string, password: string) {
    isLoading.value = true
    error.value = null
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (loginError) throw loginError

      if (data.user) {
        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single()

        if (userProfile) {
          user.value = {
            id: userProfile.id,
            email: userProfile.email,
            firstName: userProfile.first_name,
            lastName: userProfile.last_name,
            role: userProfile.role,
            createdAt: userProfile.created_at
          }
        }

        isAuthenticated.value = true
      }

      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      await supabase.auth.signOut()
      user.value = null
      isAuthenticated.value = false
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Logout failed'
    }
  }

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (userProfile) {
          user.value = {
            id: userProfile.id,
            email: userProfile.email,
            firstName: userProfile.first_name,
            lastName: userProfile.last_name,
            role: userProfile.role,
            createdAt: userProfile.created_at
          }
          isAuthenticated.value = true
        }
      }
    } catch (err) {
      console.error('Auth check failed:', err)
    }
  }

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    signup,
    login,
    logout,
    checkAuth
  }
})
