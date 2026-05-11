import { createRouter, createWebHistory } from 'vue-router'
import { getStoredToken } from '@/utils/auth-storage'

export const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true, labelKey: 'app.auth.login' }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/pages/DashboardPage.vue'),
    meta: { labelKey: 'app.menu.dashboard' }
  },
  {
    path: '/subscriptions',
    name: 'subscriptions',
    component: () => import('@/pages/SubscriptionsPage.vue'),
    meta: { labelKey: 'app.menu.subscriptions' }
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: () => import('@/pages/CalendarPage.vue'),
    meta: { labelKey: 'app.menu.calendar' }
  },
  {
    path: '/statistics',
    name: 'statistics',
    component: () => import('@/pages/StatisticsPage.vue'),
    meta: { labelKey: 'app.menu.statistics' }
  },
  {
    path: '/budgets',
    name: 'budgets',
    component: () => import('@/pages/BudgetPage.vue'),
    meta: { labelKey: 'app.menu.budgets' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
    meta: { labelKey: 'app.menu.settings' }
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const token = getStoredToken()

  if (to.meta.public) {
    if (to.path === '/login' && token) {
      return '/dashboard'
    }
    return true
  }

  if (!token) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    }
  }

  return true
})
