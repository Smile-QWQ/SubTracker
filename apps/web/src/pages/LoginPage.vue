<template>
  <div class="login-page">
    <n-card class="login-card" :bordered="false">
      <div class="login-header">
        <div class="login-header__icon">
          <img :src="brandLogoUrl" alt="SubTracker logo" class="login-header__logo" />
        </div>
        <div>
          <h1 class="login-title">{{ t('login.title') }}</h1>
          <p class="login-subtitle">{{ t('login.subtitle') }}</p>
        </div>
      </div>

      <n-form :model="form" label-placement="top" @submit.prevent="submit">
        <n-form-item :label="t('common.labels.username')">
          <n-input
            v-model:value="form.username"
            :placeholder="t('login.usernamePlaceholder')"
            @keydown.enter.prevent="submit"
          />
        </n-form-item>
        <n-form-item :label="t('common.labels.password')">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="t('login.passwordPlaceholder')"
            @keydown.enter.prevent="submit"
          />
        </n-form-item>
        <div class="login-options">
          <n-checkbox v-model:checked="form.rememberMe">
            {{ t('login.rememberMe') }}
            <span class="login-options__hint">{{ t('login.rememberMeDays', { days: rememberSessionDays }) }}</span>
          </n-checkbox>
          <n-button v-if="forgotPasswordEnabled" text type="primary" @click="forgotPasswordVisible = !forgotPasswordVisible">
            {{ forgotPasswordVisible ? t('login.collapseForgotPassword') : t('login.forgotPassword') }}
          </n-button>
        </div>
        <n-button type="primary" block attr-type="submit" :loading="submitting" @click="submit">{{ t('app.auth.login') }}</n-button>
      </n-form>

      <n-collapse-transition :show="forgotPasswordVisible">
        <div class="forgot-password-panel">
          <n-form label-placement="top">
            <n-form-item :label="t('common.labels.username')">
              <n-input v-model:value="forgotPasswordForm.username" :placeholder="t('login.usernamePlaceholder')" />
            </n-form-item>
            <n-button block secondary :loading="sendingCode" @click="sendForgotPasswordCode">{{ t('login.sendCode') }}</n-button>
            <n-form-item :label="t('common.labels.code')" style="margin-top: 12px">
              <n-input v-model:value="forgotPasswordForm.code" :placeholder="t('login.codePlaceholder')" />
            </n-form-item>
            <n-form-item :label="t('app.newPassword')">
              <n-input
                v-model:value="forgotPasswordForm.newPassword"
                type="password"
                show-password-on="click"
                :placeholder="t('login.newPasswordPlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('app.confirmNewPassword')">
              <n-input
                v-model:value="forgotPasswordForm.confirmPassword"
                type="password"
                show-password-on="click"
                :placeholder="t('login.confirmNewPasswordPlaceholder')"
              />
            </n-form-item>
            <n-button block type="primary" ghost :loading="resettingPassword" @click="resetForgotPassword">
              {{ t('login.verifyAndResetPassword') }}
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
import { NButton, NCard, NCheckbox, NCollapseTransition, NForm, NFormItem, NIcon, NInput } from 'naive-ui'
import brandLogoUrl from '@/assets/brand-logo.png'
import { api } from '@/composables/api'
import { t } from '@/locales'
import { useAuthStore } from '@/stores/auth'
import { validateLoginForm } from '@/utils/login-validation'
import { useLocalizedMessage } from '@/utils/localized-message'

const route = useRoute()
const router = useRouter()
const message = useLocalizedMessage()
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
    message.success(t('auth.success.login'))
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('auth.error.login'))
  } finally {
    submitting.value = false
  }
}

async function sendForgotPasswordCode() {
  if (sendingCode.value) return
  if (!forgotPasswordForm.username.trim()) {
    message.error(t('auth.validation.usernameRequired'))
    return
  }

  try {
    sendingCode.value = true
    await api.requestForgotPasswordCode({
      username: forgotPasswordForm.username.trim()
    })
    message.success(t('auth.success.forgotPasswordCodeSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('auth.error.forgotPasswordCodeSend'))
  } finally {
    sendingCode.value = false
  }
}

async function resetForgotPassword() {
  if (resettingPassword.value) return
  if (!forgotPasswordForm.username.trim()) {
    message.error(t('auth.validation.usernameRequired'))
    return
  }
  if (!/^\d{6}$/.test(forgotPasswordForm.code.trim())) {
    message.error(t('auth.validation.codeRequired'))
    return
  }
  const newPassword = forgotPasswordForm.newPassword.trim()
  const confirmPassword = forgotPasswordForm.confirmPassword.trim()
  if (!newPassword) {
    message.error(t('auth.validation.newPasswordRequired'))
    return
  }
  if (newPassword.length < 4) {
    message.error(t('auth.validation.newPasswordMin'))
    return
  }
  if (newPassword !== confirmPassword) {
    message.error(t('auth.validation.passwordMismatch'))
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
    message.success(t('auth.success.passwordResetAndLoggedIn'))
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('auth.error.passwordReset'))
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
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.login-header__logo {
  width: 46px;
  height: 46px;
  display: block;
  object-fit: contain;
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
