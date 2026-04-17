<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <router-view v-if="isLoginPage" />
      <template v-else>
        <n-layout has-sider class="app-layout">
          <n-drawer v-model:show="mobileMenuVisible" placement="left" :width="260">
            <n-drawer-content title="SubTracker" closable body-content-style="padding: 8px 0;">
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
            show-trigger
          >
            <div class="logo" :class="{ 'logo--collapsed': siderCollapsed }">
              <div class="logo__icon">
                <n-icon :size="18">
                  <wallet-outline />
                </n-icon>
              </div>
              <span v-show="!siderCollapsed" class="logo__text">SubTracker</span>
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
      </template>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import {
  NButton,
  NConfigProvider,
  NDrawer,
  NDrawerContent,
  NIcon,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NMenu,
  NMessageProvider,
  NSpace,
  NTag,
  dateZhCN,
  zhCN
} from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
  BarChartOutline,
  CalendarOutline,
  GridOutline,
  LayersOutline,
  MenuOutline,
  SettingsOutline,
  SparklesOutline,
  WalletOutline
} from '@vicons/ionicons5'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const mobileMenuVisible = ref(false)
const siderCollapsed = ref(false)
const { width } = useWindowSize()

function renderMenuIcon(icon: typeof GridOutline) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions: MenuOption[] = [
  { label: '仪表盘', key: '/dashboard', icon: renderMenuIcon(GridOutline) },
  { label: '订阅管理', key: '/subscriptions', icon: renderMenuIcon(LayersOutline) },
  { label: '订阅日历', key: '/calendar', icon: renderMenuIcon(CalendarOutline) },
  { label: '费用统计', key: '/statistics', icon: renderMenuIcon(BarChartOutline) },
  { label: '系统设置', key: '/settings', icon: renderMenuIcon(SettingsOutline) }
]

const activeKey = computed(() => route.path)
const isLoginPage = computed(() => route.path === '/login')
const isMobile = computed(() => width.value < 960)
const isCompact = computed(() => width.value < 640)
const contentStyle = computed(() => (isMobile.value ? 'padding: 12px;' : 'padding: 20px 24px;'))

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
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid #e5e7eb;
  overflow: hidden;
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
  color: #0f172a;
}

.card-muted {
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 960px) {
  .header {
    padding: 10px 12px;
  }

  .header__right {
    gap: 6px;
  }

  .header :deep(.n-tag) {
    max-width: 120px;
  }
}

@media (max-width: 640px) {
  .header {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .header__right {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
