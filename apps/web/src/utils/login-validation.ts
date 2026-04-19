export function validateLoginForm(username: string, password: string) {
  if (!username.trim() && !password.trim()) return '请输入用户名和密码'
  if (!username.trim()) return '请输入用户名'
  if (!password.trim()) return '请输入密码'
  return null
}
