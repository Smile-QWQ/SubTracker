<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <router-view v-if="isLoginPage" />
      <template v-else>
        <n-layout has-sider class="app-layout">
          <n-drawer v-model:show="mobileMenuVisible" placement="left" :width="260">
            <n-drawer-content closable body-content-style="padding: 8px 0;">
              <template #header>
                <div class="logo__stack">
                  <span class="logo__text">SubTracker</span>
                  <span class="logo__version">{{ appVersion }}</span>
                </div>
              </template>
              <n-menu :options="menuOptions" :value="activeKey" @update:value="handleMobileMenuClick" />
            </n-drawer-content>
          </n-drawer>

          <n-layout-sider
            v-if="!isMobile"
            v-model:collapsed="siderCollapsed"
            bordered
            collapse-mode="width"
            :collapsed-width="64"
            :width="220"
          >
            <div class="logo" :class="{ 'logo--collapsed': siderCollapsed }">
              <template v-if="!siderCollapsed">
                <div class="logo__brand">
                  <div class="logo__icon">
                    <n-icon :size="18">
                      <wallet-outline />
                    </n-icon>
                  </div>
                  <div class="logo__stack">
                    <span class="logo__text">SubTracker</span>
                    <span class="logo__version">{{ appVersion }}</span>
                  </div>
                </div>
                <n-button quaternary circle class="logo__toggle" @click="siderCollapsed = !siderCollapsed">
                  <template #icon>
                    <n-icon>
                      <chevron-back-outline />
                    </n-icon>
                  </template>
                </n-button>
              </template>
              <template v-else>
                <n-button quaternary circle class="logo__toggle logo__toggle--collapsed" @click="siderCollapsed = !siderCollapsed">
                  <template #icon>
                    <n-icon>
                      <chevron-forward-outline />
                    </n-icon>
                  </template>
                </n-button>
              </template>
            </div>
            <n-menu :collapsed="siderCollapsed" :collapsed-width="64" :options="menuOptions" :value="activeKey" @update:value="handleMenuClick" />
          </n-layout-sider>

          <n-layout>
            <n-layout-header bordered class="header">
              <div class="header__left">
                <n-button v-if="isMobile" quaternary circle @click="mobileMenuVisible = true">
                  <template #icon>
                    <n-icon><menu-outline /></n-icon>
                  </template>
                </n-button>

                <div class="header__content">
                  <div class="header__title">
                    <n-icon :size="18">
                      <sparkles-outline />
                    </n-icon>
                    <strong>订阅管理台</strong>
                  </div>
                  <div v-if="!isCompact" class="card-muted">多币种 · 提醒 · 统计 · 日历</div>
                </div>
              </div>

              <n-space align="center" :size="8" class="header__right">
                <n-tag type="info" round>{{ authStore.username || '未登录' }}</n-tag>
                <n-button quaternary @click="logout">退出登录</n-button>
              </n-space>
            </n-layout-header>

            <n-layout-content :content-style="contentStyle">
              <router-view />
            </n-layout-content>
          </n-layout>
        </n-layout>

        <n-modal
          :show="authStore.mustChangePassword"
          preset="card"
          title="请先修改默认密码"
          :mask-closable="false"
          :closable="false"
          style="width: min(480px, calc(100vw - 24px))"
        >
          <n-space vertical>
            <n-alert type="warning" :show-icon="false">
              当前仍在使用默认管理员密码。为了继续使用系统，请先修改密码。
            </n-alert>
            <n-form :model="defaultPasswordForm" label-placement="top">
              <n-form-item label="新密码">
                <n-input v-model:value="defaultPasswordForm.newPassword" type="password" show-password-on="click" />
              </n-form-item>
              <n-form-item label="再次输入新密码">
                <n-input v-model:value="defaultPasswordForm.confirmPassword" type="password" show-password-on="click" />
              </n-form-item>
            </n-form>
            <n-space justify="end">
              <n-button @click="logout">退出登录</n-button>
              <n-button type="primary" :loading="changingDefaultPassword" @click="submitDefaultPasswordChange">确认修改</n-button>
            </n-space>
          </n-space>
        </n-modal>
      </template>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import {
  NAlert,
  NButton,
  NConfigProvider,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NMenu,
  NMessageProvider,
  NModal,
  NSpace,
  NTag,
  createDiscreteApi,
  dateZhCN,
  zhCN
} from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
  BarChartOutline,
  CalendarOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  GridOutline,
  LayersOutline,
  MenuOutline,
  SettingsOutline,
  SparklesOutline,
  WalletOutline
} from '@vicons/ionicons5'
import { api } from '@/composables/api'
import { useSettingsQuery } from '@/composables/settings-query'
import { useAuthStore } from '@/stores/auth'
import { isRememberedSession } from '@/utils/auth-storage'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { message } = createDiscreteApi(['message'])
const appVersion = __APP_VERSION__
const mobileMenuVisible = ref(false)
const siderCollapsed = ref(false)
const { width } = useWindowSize()
const changingDefaultPassword = ref(false)
const defaultPasswordForm = reactive({
  newPassword: '',
  confirmPassword: ''
})

const { data: settings } = useSettingsQuery()

function renderMenuIcon(icon: typeof GridOutline) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions = computed<MenuOption[]>(() => {
  const options: MenuOption[] = [
    { label: '仪表盘', key: '/dashboard', icon: renderMenuIcon(GridOutline) },
    { label: '订阅管理', key: '/subscriptions', icon: renderMenuIcon(LayersOutline) },
    { label: '订阅日历', key: '/calendar', icon: renderMenuIcon(CalendarOutline) },
    { label: '费用统计', key: '/statistics', icon: renderMenuIcon(BarChartOutline) }
  ]

  if (settings.value?.enableTagBudgets) {
    options.push({ label: '预算统计', key: '/budgets', icon: renderMenuIcon(WalletOutline) })
  }

  options.push({ label: '系统设置', key: '/settings', icon: renderMenuIcon(SettingsOutline) })
  return options
})

const activeKey = computed(() => route.path)
const isLoginPage = computed(() => route.path === '/login')
const isMobile = computed(() => width.value < 960)
const isCompact = computed(() => width.value < 640)
const contentStyle = computed(() => (isMobile.value ? 'padding: 12px;' : 'padding: 20px 24px;'))

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    return
  }

  try {
    await authStore.refreshCurrentUser()
  } catch {
    // handled by axios interceptor
  }
})

function handleMenuClick(key: string) {
  router.push(key)
}

function handleMobileMenuClick(key: string) {
  mobileMenuVisible.value = false
  handleMenuClick(key)
}

async function logout() {
  authStore.clearSession()
  await router.replace('/login')
}

async function submitDefaultPasswordChange() {
  if (changingDefaultPassword.value) return

  const newPassword = defaultPasswordForm.newPassword.trim()
  const confirmPassword = defaultPasswordForm.confirmPassword.trim()

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

  changingDefaultPassword.value = true
  try {
    const result = await api.changeDefaultPassword(newPassword)
    authStore.setSession(
      result.token,
      result.user.username,
      isRememberedSession(),
      result.user.mustChangePassword
    )
    defaultPasswordForm.newPassword = ''
    defaultPasswordForm.confirmPassword = ''
    message.success('默认密码已修改')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '修改默认密码失败')
  } finally {
    changingDefaultPassword.value = false
  }
}
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid #e5e7eb;
  overflow: hidden;
}

.logo__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo__stack {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.1;
}

.logo--collapsed {
  justify-content: center;
  padding: 0;
}

.logo__icon {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo__text {
  min-width: 0;
  white-space: nowrap;
}

.logo__version {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  white-space: nowrap;
}

.logo__toggle {
  flex-shrink: 0;
}

.logo__toggle--collapsed {
  margin: 0 auto;
}

.header {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  background: #fff;
}

.header__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.header__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  color: #0f172a;
}

.header__right {
  flex-shrink: 0;
}

.card-muted {
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 640px) {
  .header {
    padding: 0 12px;
  }

  .header__title {
    font-size: 16px;
  }
}
</style>
