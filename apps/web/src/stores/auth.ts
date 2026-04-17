import { defineStore } from 'pinia'
import { api } from '@/composables/api'
import { clearAuthSession, getStoredToken, getStoredUsername, saveAuthSession } from '@/utils/auth-storage'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getStoredToken() ?? '',
    username: getStoredUsername() ?? ''
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token)
  },
  actions: {
    setSession(token: string, username: string, remember = false) {
      this.token = token
      this.username = username
      saveAuthSession(token, username, remember)
    },
    clearSession() {
      this.token = ''
      this.username = ''
      clearAuthSession()
    },
    async login(username: string, password: string, rememberMe = false, rememberDays?: number) {
      const result = await api.login(username, password, rememberMe, rememberDays)
      this.setSession(result.token, result.user.username, rememberMe)
      return result
    }
  }
})
