const TOKEN_KEY = 'subtracker.auth.token'
const USERNAME_KEY = 'subtracker.auth.username'

function readFromStorage(key: string) {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
}

export function getStoredToken() {
  return readFromStorage(TOKEN_KEY)
}

export function getStoredUsername() {
  return readFromStorage(USERNAME_KEY)
}

export function saveAuthSession(token: string, username: string, remember = false) {
  if (typeof window === 'undefined') return

  const activeStorage = remember ? window.localStorage : window.sessionStorage
  const inactiveStorage = remember ? window.sessionStorage : window.localStorage

  activeStorage.setItem(TOKEN_KEY, token)
  activeStorage.setItem(USERNAME_KEY, username)
  inactiveStorage.removeItem(TOKEN_KEY)
  inactiveStorage.removeItem(USERNAME_KEY)
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USERNAME_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(USERNAME_KEY)
}
