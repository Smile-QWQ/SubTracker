import { defineStore } from 'pinia'
import { api } from '@/composables/api'
import { clearAuthSession, getStoredToken, getStoredUsername, saveAuthSession } from '@/utils/auth-storage'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getStoredToken() ?? '',
    username: getStoredUsername() ?? '',
    mustChangePassword: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token)
  },
  actions: {
    setSession(token: string, username: string, remember = false, mustChangePassword = false) {
      this.token = token
      this.username = username
      this.mustChangePassword = mustChangePassword
      saveAuthSession(token, username, remember)
    },
    setUser(username: string, mustChangePassword = false) {
      this.username = username
      this.mustChangePassword = mustChangePassword
    },
    clearSession() {
      this.token = ''
      this.username = ''
      this.mustChangePassword = false
      clearAuthSession()
    },
    async login(username: string, password: string, rememberMe = false, rememberDays?: number) {
      const result = await api.login(username, password, rememberMe, rememberDays)
      this.setSession(result.token, result.user.username, rememberMe, result.user.mustChangePassword)
      return result
    },
    async refreshCurrentUser() {
      const result = await api.getCurrentUser()
      this.setUser(result.user.username, result.user.mustChangePassword)
      return result.user
    }
  }
})
