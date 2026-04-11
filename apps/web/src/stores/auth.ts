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
    setSession(token: string, username: string) {
      this.token = token
      this.username = username
      saveAuthSession(token, username)
    },
    clearSession() {
      this.token = ''
      this.username = ''
      clearAuthSession()
    },
    async login(username: string, password: string) {
      const result = await api.login(username, password)
      this.setSession(result.token, result.user.username)
      return result
    }
  }
})
