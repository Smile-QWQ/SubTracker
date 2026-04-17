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
        <n-button type="primary" block attr-type="submit" @click="submit">登录</n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NForm, NFormItem, NIcon, NInput, useMessage } from 'naive-ui'
import { LockClosedOutline } from '@vicons/ionicons5'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()

const form = reactive({
  username: '',
  password: ''
})

async function submit() {
  try {
    await authStore.login(form.username, form.password)
    message.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '登录失败')
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
  background: linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%);
}

.login-card {
  width: min(420px, 100%);
  border-radius: 22px;
  box-shadow: 0 20px 60px rgba(37, 99, 235, 0.14);
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
  color: #64748b;
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
