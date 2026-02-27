import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresGuest?: boolean
    requiresAuth?: boolean
    requiresApproved?: boolean
    requiresEditor?: boolean
    requiresAdmin?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ─── Public ────────────────────────────────────────────────────────────
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresGuest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { requiresGuest: true },
    },

    // ─── Auth required (any status) ───────────────────────────────────────
    {
      path: '/pending',
      name: 'pending',
      component: () => import('@/views/PendingView.vue'),
      meta: { requiresAuth: true },
    },

    // ─── Approved users only ──────────────────────────────────────────────
    {
      path: '/',
      redirect: '/tree',
    },
    {
      path: '/tree',
      name: 'tree',
      component: () => import('@/views/TreeView.vue'),
      meta: { requiresApproved: true },
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
      meta: { requiresApproved: true },
    },
    {
      path: '/people',
      name: 'people',
      component: () => import('@/views/PeopleView.vue'),
      meta: { requiresApproved: true },
    },
    {
      path: '/people/:id',
      name: 'person',
      component: () => import('@/views/PersonView.vue'),
      meta: { requiresApproved: true },
    },
    {
      path: '/upload',
      name: 'upload',
      component: () => import('@/views/UploadView.vue'),
      meta: { requiresEditor: true },
    },
    {
      path: '/documents/:id/review',
      name: 'document-review',
      component: () => import('@/views/DocumentReviewView.vue'),
      meta: { requiresEditor: true },
    },
    {
      path: '/import/gedcom',
      name: 'gedcom-import',
      component: () => import('@/views/GedcomImportView.vue'),
      meta: { requiresEditor: true },
    },

    // ─── Admin only ───────────────────────────────────────────────────────
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/admin/AdminView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/admin/approvals',
      name: 'admin-approvals',
      component: () => import('@/views/admin/ApprovalsView.vue'),
      meta: { requiresAdmin: true },
    },

    // ─── Catch-all ────────────────────────────────────────────────────────
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // On first load, check existing session
  if (!auth.isAuthenticated) {
    await auth.checkAuth()
  }

  // Guest-only routes (login/register) — redirect authenticated users
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    if (auth.isPending) return { name: 'pending' }
    if (auth.needsOnboarding) return { name: 'onboarding' }
    return { name: 'tree' }
  }

  // Any authenticated route
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Approved-only routes
  if (to.meta.requiresApproved) {
    if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
    if (!auth.isApproved) {
      return auth.isPending ? { name: 'pending' } : { name: 'login' }
    }
    if (auth.needsOnboarding && to.name !== 'onboarding') return { name: 'onboarding' }
  }

  // Editor-only routes
  if (to.meta.requiresEditor) {
    if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
    if (!auth.isApproved) {
      return auth.isPending ? { name: 'pending' } : { name: 'login' }
    }
    if (!auth.isEditor) return { name: 'tree' }
    if (auth.needsOnboarding && to.name !== 'onboarding') return { name: 'onboarding' }
  }

  // Admin-only routes
  if (to.meta.requiresAdmin) {
    if (!auth.isAuthenticated) return { name: 'login' }
    if (!auth.isAdmin) return { name: 'tree' }
  }
})

export default router
