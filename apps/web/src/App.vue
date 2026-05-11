<template>
  <n-config-provider :locale="naiveLocale" :date-locale="naiveDateLocale" :theme="naiveTheme">
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
                <n-select
                  v-model:value="currentLocale"
                  size="small"
                  :options="localeOptions"
                  style="width: 132px"
                  @update:value="handleLocaleChange"
                />
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
              <div class="sider-menu-shell">
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
                          <span class="logo__version">{{ appVersion }}</span>
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
              <div class="sider-footer" :class="{ 'sider-footer--collapsed': siderCollapsed }">
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
                <n-select
                  v-if="!siderCollapsed"
                  v-model:value="currentLocale"
                  size="small"
                  :options="localeOptions"
                  style="width: 132px"
                  @update:value="handleLocaleChange"
                />
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
                    <strong>{{ t('app.shellTitle') }}</strong>
                  </div>
                  <div v-if="!isCompact" class="card-muted">{{ t('app.shellSubtitle') }}</div>
                </div>
              </div>

              <n-space align="center" :size="8" class="header__right">
                <n-tag type="info" round>{{ authStore.username || t('app.notSignedIn') }}</n-tag>
                <n-button quaternary @click="logout">{{ t('common.actions.signOut') }}</n-button>
              </n-space>
            </n-layout-header>

            <n-layout-content class="main-content" :content-style="contentStyle">
              <router-view />
            </n-layout-content>
          </n-layout>
        </n-layout>

        <n-modal
          :show="authStore.mustChangePassword"
          preset="card"
          :title="t('app.changeDefaultPasswordTitle')"
          :mask-closable="false"
          :closable="false"
          style="width: min(480px, calc(100vw - 24px))"
        >
          <n-space vertical>
            <n-alert type="warning" :show-icon="false">
              {{ t('app.changeDefaultPasswordWarning') }}
            </n-alert>
            <n-form :model="defaultPasswordForm" label-placement="top">
              <n-form-item :label="t('app.newPassword')">
                <n-input v-model:value="defaultPasswordForm.newPassword" type="password" show-password-on="click" />
              </n-form-item>
              <n-form-item :label="t('app.confirmNewPassword')">
                <n-input v-model:value="defaultPasswordForm.confirmPassword" type="password" show-password-on="click" />
              </n-form-item>
            </n-form>
            <n-space justify="end">
              <n-button @click="logout">{{ t('common.actions.signOut') }}</n-button>
              <n-button type="primary" :loading="changingDefaultPassword" @click="submitDefaultPasswordChange">{{ t('common.actions.confirm') }}</n-button>
            </n-space>
          </n-space>
        </n-modal>

        <n-modal
          :show="versionUpdateModalVisible"
          preset="card"
          :title="t('app.versionUpdates')"
          style="width: min(860px, calc(100vw - 24px))"
          @update:show="versionUpdateModalVisible = $event"
        >
          <n-space vertical :size="16">
            <n-alert v-if="versionUpdateState?.hasUpdate" type="warning" :show-icon="false">
              {{ t('app.updateAvailable', { currentVersion: versionUpdateState.currentVersion, latestVersion: versionUpdateState.latestVersion }) }}
            </n-alert>
            <n-alert v-else type="success" :show-icon="false">
              {{ t('app.alreadyLatest', { version: versionUpdateState?.currentVersion || appVersion }) }}
            </n-alert>

            <n-space vertical v-if="versionUpdateState?.releases?.length" :size="12">
              <n-card v-for="release in versionUpdateState.releases" :key="release.tagName" size="small" embedded>
                <n-space vertical :size="8">
                  <n-space justify="space-between" align="center">
                    <div>
                      <div class="release-item__title">{{ release.name }}</div>
                      <div class="release-item__meta">
                        {{ release.tagName }} · {{ release.publishedAt ? formatReleaseDate(release.publishedAt) : t('app.releaseUnknown') }}
                      </div>
                    </div>
                    <n-button tag="a" :href="release.htmlUrl" target="_blank" rel="noreferrer" secondary>
                      {{ t('app.viewRelease') }}
                    </n-button>
                  </n-space>
                  <div class="release-item__markdown" v-html="renderReleaseBody(release.body)" />
                </n-space>
              </n-card>
            </n-space>

            <div v-else class="card-muted">{{ t('app.noNewRelease') }}</div>
          </n-space>
        </n-modal>
      </template>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watchEffect } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
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
  NSelect,
  NSpace,
  NTag,
  NTooltip,
  darkTheme
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
import { SETTINGS_QUERY_KEY, useSettingsQuery } from '@/composables/settings-query'
import { useVersionUpdateQuery } from '@/composables/version-update-query'
import { useThemePreference, type ThemePreference } from '@/composables/theme-preference'
import { t, useAppLocale } from '@/locales'
import { useAuthStore } from '@/stores/auth'
import { isRememberedSession } from '@/utils/auth-storage'
import { renderMarkdownToHtml } from '@/utils/simple-markdown'
import { createLocalizedDiscreteMessage } from '@/utils/localized-message'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const authStore = useAuthStore()
const { resolvedTheme, setThemePreference } = useThemePreference()
const { locale, naiveLocale, naiveDateLocale, setLocale } = useAppLocale()
const message = createLocalizedDiscreteMessage()
const appVersion = __APP_VERSION__
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
    { label: t('app.menu.dashboard'), key: '/dashboard', icon: renderMenuIcon(GridOutline) },
    { label: t('app.menu.subscriptions'), key: '/subscriptions', icon: renderMenuIcon(LayersOutline) },
    { label: t('app.menu.calendar'), key: '/calendar', icon: renderMenuIcon(CalendarOutline) },
    { label: t('app.menu.statistics'), key: '/statistics', icon: renderMenuIcon(BarChartOutline) }
  ]

  if (settings.value?.enableTagBudgets) {
    options.push({ label: t('app.menu.budgets'), key: '/budgets', icon: renderMenuIcon(WalletOutline) })
  }

  options.push({ label: t('app.menu.settings'), key: '/settings', icon: renderMenuIcon(SettingsOutline) })
  return options
})

const activeKey = computed(() => route.path)
const isLoginPage = computed(() => route.path === '/login')
const isMobile = computed(() => width.value < 960)
const isCompact = computed(() => width.value < 640)
const contentStyle = computed(() => (isMobile.value ? 'padding: 12px;' : 'padding: 20px 24px;'))
const naiveTheme = computed(() => (resolvedTheme.value === 'dark' ? darkTheme : null))
const themePreferenceIcon = computed(() => (resolvedTheme.value === 'dark' ? MoonOutline : SunnyOutline))
const currentLocale = ref(locale.value)
const localeOptions = computed(() => [
  { label: t('common.locales.zhCN'), value: 'zh-CN' },
  { label: t('common.locales.enUS'), value: 'en-US' }
])
const themeToggleTooltip = computed(() => {
  const currentLabel = resolvedTheme.value === 'dark' ? t('app.theme.dark') : t('app.theme.light')
  const nextLabel = resolvedTheme.value === 'dark' ? t('app.theme.light') : t('app.theme.dark')
  return t('app.theme.current', { current: currentLabel, next: nextLabel })
})
const hasVersionUpdate = computed(() => Boolean(versionUpdateState.value?.hasUpdate))

watchEffect(() => {
  currentLocale.value = locale.value
})

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

function handleLocaleChange(value: string) {
  const nextLocale = value as 'zh-CN' | 'en-US'
  setLocale(nextLocale)
  void syncSystemDefaultLocale(nextLocale)
}

async function syncSystemDefaultLocale(localeValue: 'zh-CN' | 'en-US') {
  try {
    const currentSettings = settings.value
    if (currentSettings?.systemDefaultLocale === localeValue) {
      return
    }

    const updatedSettings = await api.updateSettings({ systemDefaultLocale: localeValue })
    queryClient.setQueryData(SETTINGS_QUERY_KEY, updatedSettings)
  } catch {
    // Ignore sync failures here to avoid blocking immediate UI language switch.
  }
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
    message.success(t('auth.success.defaultPasswordChanged'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('auth.error.passwordReset'))
  } finally {
    changingDefaultPassword.value = false
  }
}

function openVersionUpdatePanel() {
  versionUpdateModalVisible.value = true
}

function renderReleaseBody(body: string) {
  return renderMarkdownToHtml(body)
}

function formatReleaseDate(value: string) {
  try {
    return new Date(value).toLocaleString(locale.value)
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

.main-content {
}

.sider-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sider-menu-shell {
  flex: 1;
  min-height: 0;
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
  align-items: center;
  gap: 10px;
  justify-content: flex-start;
  padding: 12px;
  margin-top: auto;
  border-top: 1px solid var(--app-border);
}

.sider-footer--collapsed {
  justify-content: center;
}

.theme-toggle {
  box-shadow: inset 0 0 0 1px var(--app-border-soft);
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
  display: inline-flex;
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
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.logo__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.logo__update-dot {
  position: absolute;
  top: 0;
  right: 0;
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

.logo__toggle {
  flex-shrink: 0;
}

.logo__toggle--collapsed {
  margin: 0 auto;
}

.release-item__title {
  font-weight: 700;
  color: var(--app-text-strong);
}

.release-item__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.release-item__markdown {
  color: var(--app-text-primary);
  line-height: 1.7;
}

.release-item__markdown :deep(h1),
.release-item__markdown :deep(h2),
.release-item__markdown :deep(h3) {
  margin: 0 0 8px;
  font-size: 15px;
}

.release-item__markdown :deep(p) {
  margin: 0 0 8px;
}

.release-item__markdown :deep(ul) {
  margin: 0;
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
