const TOKEN_KEY = 'subtracker.auth.token'
const USERNAME_KEY = 'subtracker.auth.username'

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function getStoredUsername() {
  return window.localStorage.getItem(USERNAME_KEY)
}

export function saveAuthSession(token: string, username: string) {
  window.localStorage.setItem(TOKEN_KEY, token)
  window.localStorage.setItem(USERNAME_KEY, username)
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USERNAME_KEY)
}
