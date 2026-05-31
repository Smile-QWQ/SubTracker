import { createRouter, createWebHistory } from 'vue-router'
import { getStoredToken } from '@/utils/auth-storage'
import { t } from '@/locales'

export const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true, label: t('app.nav.public.login') }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/pages/DashboardPage.vue'),
    meta: { label: t('app.nav.dashboard') }
  },
  {
    path: '/subscriptions',
    name: 'subscriptions',
    component: () => import('@/pages/SubscriptionsPage.vue'),
    meta: { label: t('app.nav.subscriptions') }
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: () => import('@/pages/CalendarPage.vue'),
    meta: { label: t('app.nav.calendar') }
  },
  {
    path: '/statistics',
    name: 'statistics',
    component: () => import('@/pages/StatisticsPage.vue'),
    meta: { label: t('app.nav.statistics') }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
    meta: { label: t('app.nav.settings') }
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
