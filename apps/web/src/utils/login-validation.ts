import { t } from '@/locales'

export function validateLoginForm(username: string, password: string) {
  if (!username.trim() && !password.trim()) return t('auth.validation.usernameAndPasswordRequired')
  if (!username.trim()) return t('auth.validation.usernameRequired')
  if (!password.trim()) return t('auth.validation.passwordRequired')
  return null
}
