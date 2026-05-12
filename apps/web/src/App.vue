<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme="naiveTheme">
    <n-message-provider>
      <router-view v-if="isLoginPage" />
      <template v-else>
        <n-layout has-sider class="app-layout" content-style="overflow: visible;">
          <n-drawer v-model:show="mobileMenuVisible" placement="left" :width="260">
            <n-drawer-content closable body-content-style="padding: 8px 0;">
              <template #header>
                <div class="logo__stack">
                  <span class="logo__text">SubTracker</span>
                  <span class="logo__version">{{ appVersion }}</span>
                </div>
              </template>
              <div class="sider-shell">
                <div class="sider-menu">
                  <n-menu :options="menuOptions" :value="activeKey" @update:value="handleMobileMenuClick" />
                </div>
                <div class="sider-footer">
                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-button quaternary circle class="theme-toggle" @click="cycleThemePreference">
                        <template #icon>
                          <n-icon>
                            <component :is="themePreferenceIcon" />
                          </n-icon>
                        </template>
                      </n-button>
                    </template>
                    <span>{{ themeToggleTooltip }}</span>
                  </n-tooltip>
                </div>
              </div>
            </n-drawer-content>
          </n-drawer>

          <n-layout-sider
            v-if="!isMobile"
            v-model:collapsed="siderCollapsed"
            bordered
            collapse-mode="width"
            :collapsed-width="64"
            :width="220"
            class="desktop-sider"
          >
            <div class="sider-shell">
              <div>
                <div class="logo" :class="{ 'logo--collapsed': siderCollapsed }">
                  <template v-if="!siderCollapsed">
                    <div class="logo__brand">
                      <div class="logo__brand-trigger" @click="openVersionUpdatePanel">
                        <div class="logo__icon">
                          <img :src="brandLogoUrl" alt="SubTracker logo" class="logo__image" />
                          <span v-if="hasVersionUpdate" class="logo__update-dot" />
                        </div>
                        <div class="logo__stack">
                          <span class="logo__text">SubTracker</span>
                          <span class="logo__meta">
                            <span class="logo__version">{{ appVersion }}</span>
                            <span class="logo__variant">{{ appVariant }}</span>
                          </span>
                        </div>
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
              </div>
            </div>
          </n-layout-sider>

          <n-layout class="main-layout">
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

            <n-layout-content class="main-content" :content-style="contentStyle">
              <router-view />
            </n-layout-content>
          </n-layout>
        </n-layout>

        <div v-if="!isMobile" class="theme-fab-shell">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary circle class="theme-toggle theme-toggle--floating" @click="cycleThemePreference">
                <template #icon>
                  <n-icon>
                    <component :is="themePreferenceIcon" />
                  </n-icon>
                </template>
              </n-button>
            </template>
            <span>{{ themeToggleTooltip }}</span>
          </n-tooltip>
        </div>

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

        <n-modal
          :show="versionUpdateModalVisible"
          preset="card"
          title="版本更新"
          style="width: min(860px, calc(100vw - 24px))"
          @update:show="versionUpdateModalVisible = $event"
        >
          <n-space vertical :size="16">
            <n-alert v-if="versionUpdateState?.hasUpdate" type="warning" :show-icon="false">
              检测到新版本，当前版本 {{ versionUpdateState.currentVersion }}，最新版本 {{ versionUpdateState.latestVersion }}
            </n-alert>
            <n-alert v-else type="success" :show-icon="false">
              当前已经是最新版本（{{ versionUpdateState?.currentVersion || appVersion }}）
            </n-alert>

            <n-space vertical v-if="versionUpdateState?.releases?.length" :size="12">
              <n-card v-for="release in versionUpdateState.releases" :key="release.tagName" size="small" embedded>
                <n-space vertical :size="8">
                  <n-space justify="space-between" align="center">
                    <div>
                      <div class="release-item__title">{{ release.name }}</div>
                      <div class="release-item__meta">
                        {{ release.tagName }} · {{ release.publishedAt ? formatReleaseDate(release.publishedAt) : '发布时间未知' }}
                      </div>
                    </div>
                    <n-button tag="a" :href="release.htmlUrl" target="_blank" rel="noreferrer" secondary>
                      查看 Commit
                    </n-button>
                  </n-space>
                  <div class="release-item__markdown" v-html="renderReleaseBody(release.body)" />
                </n-space>
              </n-card>
            </n-space>

            <div v-else class="card-muted">暂无比当前版本更新的 lite 提交。</div>
          </n-space>
        </n-modal>
      </template>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import {
  NAlert,
  NButton,
  NCard,
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
  NTooltip,
  createDiscreteApi,
  darkTheme,
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
  MoonOutline,
  SettingsOutline,
  SparklesOutline,
  SunnyOutline,
  WalletOutline
} from '@vicons/ionicons5'
import brandLogoUrl from '@/assets/brand-logo.png'
import { api } from '@/composables/api'
import { useSettingsQuery } from '@/composables/settings-query'
import { useVersionUpdateQuery } from '@/composables/version-update-query'
import { useThemePreference, type ThemePreference } from '@/composables/theme-preference'
import { useAuthStore } from '@/stores/auth'
import { isRememberedSession } from '@/utils/auth-storage'
import { renderMarkdownToHtml } from '@/utils/simple-markdown'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { resolvedTheme, setThemePreference } = useThemePreference()
const { message } = createDiscreteApi(['message'])
const appVersion = __APP_VERSION__
const appVariant = 'Lite'
const mobileMenuVisible = ref(false)
const siderCollapsed = ref(false)
const versionUpdateModalVisible = ref(false)
const { width } = useWindowSize()
const changingDefaultPassword = ref(false)
const defaultPasswordForm = reactive({
  newPassword: '',
  confirmPassword: ''
})

const { data: settings } = useSettingsQuery()
const { data: versionUpdateState } = useVersionUpdateQuery(appVersion)

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
const naiveTheme = computed(() => (resolvedTheme.value === 'dark' ? darkTheme : null))
const themePreferenceIcon = computed(() => (resolvedTheme.value === 'dark' ? MoonOutline : SunnyOutline))
const themeToggleTooltip = computed(() => {
  const currentLabel = resolvedTheme.value === 'dark' ? '深色' : '浅色'
  const nextLabel = currentLabel === '深色' ? '浅色' : '深色'
  return `当前主题：${currentLabel}，点击切换到${nextLabel}`
})
const hasVersionUpdate = computed(() => Boolean(versionUpdateState.value?.hasUpdate))

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolvedTheme.value
})

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

function cycleThemePreference() {
  const nextTheme: ThemePreference = resolvedTheme.value === 'dark' ? 'light' : 'dark'
  setThemePreference(nextTheme)
}

function openVersionUpdatePanel() {
  versionUpdateModalVisible.value = true
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

function renderReleaseBody(body: string) {
  return renderMarkdownToHtml(body || '')
}

function formatReleaseDate(value: string) {
  try {
    return new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return value
  }
}
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  overflow: visible;
}

.desktop-sider {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
  flex-shrink: 0;
  align-self: flex-start;
}

.main-layout {
  min-width: 0;
}

.sider-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sider-menu {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sider-footer {
  display: flex;
  justify-content: flex-start;
  padding: 12px;
  margin-top: auto;
}

.sider-footer--collapsed {
  justify-content: center;
}

.theme-toggle {
  box-shadow: inset 0 0 0 1px var(--app-border-soft);
}

.theme-toggle--floating {
  position: fixed;
  left: 12px;
  bottom: 16px;
  z-index: 30;
  background: var(--app-surface);
}

.theme-fab-shell {
  pointer-events: none;
}

.theme-fab-shell :deep(.n-button) {
  pointer-events: auto;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid var(--app-border);
  overflow: hidden;
}

.logo__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo__brand-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo__image {
  width: 30px;
  height: 30px;
  display: block;
  object-fit: contain;
}

.logo__update-dot {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 2px var(--app-surface);
}

.logo__text {
  min-width: 0;
  white-space: nowrap;
}

.logo__version {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.logo__meta {
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.logo__variant {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-accent) 20%, transparent);
  font-size: 9px;
  font-weight: 600;
  color: var(--app-accent);
  white-space: nowrap;
  margin-left: auto;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.logo__toggle {
  flex-shrink: 0;
}

.logo__toggle--collapsed {
  margin: 0 auto;
}

.release-item__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.release-item__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.release-item__markdown {
  color: var(--app-text-secondary);
  line-height: 1.7;
  word-break: break-word;
}

.release-item__markdown :deep(p) {
  margin: 0 0 8px;
}

.release-item__markdown :deep(ul),
.release-item__markdown :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
}

.header {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  background: var(--app-surface);
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
  color: var(--app-text-strong);
}

.header__right {
  flex-shrink: 0;
}

.card-muted {
  color: var(--app-text-secondary);
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
