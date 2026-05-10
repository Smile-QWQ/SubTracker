<template>
  <div class="login-page">
    <n-card class="login-card" :bordered="false">
      <div class="login-header">
        <div class="login-header__icon">
          <n-icon :size="22">
            <lock-closed-outline />
          </n-icon>
        </div>
        <div>
          <h1 class="login-title">登录 SubTracker</h1>
          <p class="login-subtitle">请输入您的用户名和密码</p>
        </div>
      </div>

      <n-form :model="form" label-placement="top" @submit.prevent="submit">
        <n-form-item label="用户名">
          <n-input
            v-model:value="form.username"
            placeholder="请输入用户名"
            @keydown.enter.prevent="submit"
          />
        </n-form-item>
        <n-form-item label="密码">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            @keydown.enter.prevent="submit"
          />
        </n-form-item>
        <div class="login-options">
          <n-checkbox v-model:checked="form.rememberMe">
            记住我
            <span class="login-options__hint">（{{ rememberSessionDays }} 天）</span>
          </n-checkbox>
          <n-button v-if="forgotPasswordEnabled" text type="primary" @click="forgotPasswordVisible = !forgotPasswordVisible">
            {{ forgotPasswordVisible ? '收起找回密码' : '忘记密码' }}
          </n-button>
        </div>
        <n-button type="primary" block attr-type="submit" :loading="submitting" @click="submit">登录</n-button>
      </n-form>

      <n-collapse-transition :show="forgotPasswordVisible">
        <div class="forgot-password-panel">
          <n-form label-placement="top">
            <n-form-item label="用户名">
              <n-input v-model:value="forgotPasswordForm.username" placeholder="请输入用户名" />
            </n-form-item>
            <n-button block secondary :loading="sendingCode" @click="sendForgotPasswordCode">发送验证码</n-button>
            <n-form-item label="验证码" style="margin-top: 12px">
              <n-input v-model:value="forgotPasswordForm.code" placeholder="请输入 6 位验证码" />
            </n-form-item>
            <n-form-item label="新密码">
              <n-input v-model:value="forgotPasswordForm.newPassword" type="password" show-password-on="click" placeholder="请输入新密码" />
            </n-form-item>
            <n-form-item label="确认新密码">
              <n-input
                v-model:value="forgotPasswordForm.confirmPassword"
                type="password"
                show-password-on="click"
                placeholder="请再次输入新密码"
              />
            </n-form-item>
            <n-button block type="primary" ghost :loading="resettingPassword" @click="resetForgotPassword">
              验证并重置密码
            </n-button>
          </n-form>
        </div>
      </n-collapse-transition>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NCheckbox, NCollapseTransition, NForm, NFormItem, NIcon, NInput, useMessage } from 'naive-ui'
import { LockClosedOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import { useAuthStore } from '@/stores/auth'
import { validateLoginForm } from '@/utils/login-validation'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()
const rememberSessionDays = ref(7)
const forgotPasswordEnabled = ref(false)
const forgotPasswordVisible = ref(false)
const submitting = ref(false)
const sendingCode = ref(false)
const resettingPassword = ref(false)

const form = reactive({
  username: '',
  password: '',
  rememberMe: false
})

const forgotPasswordForm = reactive({
  username: '',
  code: '',
  newPassword: '',
  confirmPassword: ''
})

onMounted(async () => {
  try {
    const options = await api.getLoginOptions()
    rememberSessionDays.value = options.rememberSessionDays
    forgotPasswordEnabled.value = options.forgotPasswordEnabled
  } catch {
    rememberSessionDays.value = 7
    forgotPasswordEnabled.value = false
  }
})

async function submit() {
  if (submitting.value) return

  const validationMessage = validateLoginForm(form.username, form.password)
  if (validationMessage) {
    message.error(validationMessage)
    return
  }

  try {
    submitting.value = true
    await authStore.login(
      form.username,
      form.password,
      form.rememberMe,
      form.rememberMe ? rememberSessionDays.value : undefined
    )
    message.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '登录失败')
  } finally {
    submitting.value = false
  }
}

async function sendForgotPasswordCode() {
  if (sendingCode.value) return
  if (!forgotPasswordForm.username.trim()) {
    message.error('请输入用户名')
    return
  }

  try {
    sendingCode.value = true
    await api.requestForgotPasswordCode({
      username: forgotPasswordForm.username.trim()
    })
    message.success('如果用户名有效且通知已启用，验证码已发送')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '验证码发送失败')
  } finally {
    sendingCode.value = false
  }
}

async function resetForgotPassword() {
  if (resettingPassword.value) return
  if (!forgotPasswordForm.username.trim()) {
    message.error('请输入用户名')
    return
  }
  if (!/^\d{6}$/.test(forgotPasswordForm.code.trim())) {
    message.error('请输入 6 位验证码')
    return
  }
  const newPassword = forgotPasswordForm.newPassword.trim()
  const confirmPassword = forgotPasswordForm.confirmPassword.trim()
  if (!newPassword) {
    message.error('请输入新密码')
    return
  }
  if (newPassword.length < 4) {
    message.error('新密码至少 4 位')
    return
  }
  if (newPassword !== confirmPassword) {
    message.error('两次输入的新密码不一致')
    return
  }

  try {
    resettingPassword.value = true
    const result = await api.resetForgotPassword({
      username: forgotPasswordForm.username.trim(),
      code: forgotPasswordForm.code.trim(),
      newPassword
    })
    authStore.setSession(result.token, result.user.username, false, result.user.mustChangePassword)
    message.success('密码已重置并自动登录')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '密码重置失败')
  } finally {
    resettingPassword.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-gradient-soft);
}

.login-card {
  width: min(420px, 100%);
  border-radius: 22px;
  box-shadow: var(--app-shadow-strong);
}

.login-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.login-header__icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
}

.login-title {
  margin: 0;
  font-size: 24px;
}

.login-subtitle {
  margin: 6px 0 0;
  color: var(--app-text-secondary);
}

.login-options {
  margin: -2px 0 14px;
  color: var(--app-text-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.login-options__hint {
  color: var(--app-text-muted);
}

.forgot-password-panel {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--app-border-soft);
}

@media (max-width: 520px) {
  .login-page {
    padding: 16px;
  }

  .login-card {
    border-radius: 18px;
  }

  .login-title {
    font-size: 22px;
  }
}
</style>
