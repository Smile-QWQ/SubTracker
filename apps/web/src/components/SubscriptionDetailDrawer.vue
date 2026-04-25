<template>
  <n-drawer :show="show" :width="drawerWidth" @mask-click="emit('close')" @update:show="handleShowUpdate">
    <n-drawer-content title="订阅详情" closable>
      <n-empty v-if="!detail" description="暂无数据" />
      <template v-else>
        <n-space vertical :size="16">
          <n-space align="center">
            <img v-if="detail.logoUrl" :src="resolveLogoUrl(detail.logoUrl)" alt="logo" class="detail-logo" />
            <div v-else class="detail-logo detail-logo--fallback">{{ detail.name.slice(0, 1).toUpperCase() }}</div>
            <div>
              <div class="detail-title">{{ detail.name }}</div>
              <div v-if="detail.websiteUrl" class="detail-site">
                <a :href="detail.websiteUrl" target="_blank" rel="noreferrer">{{ detail.websiteUrl }}</a>
              </div>
            </div>
          </n-space>

          <n-descriptions label-placement="left" :column="descriptionColumns" bordered>
            <n-descriptions-item label="名称">{{ detail.name }}</n-descriptions-item>
            <n-descriptions-item label="状态">
              <n-tag :type="getSubscriptionStatusTagType(detail.status)">{{ getSubscriptionStatusText(detail.status) }}</n-tag>
            </n-descriptions-item>
            <n-descriptions-item label="标签">
              <n-space size="small" wrap>
                <n-tag
                  v-for="item in detail.tags ?? []"
                  :key="item.id"
                  size="small"
                  :bordered="false"
                  :color="{ color: item.color, textColor: '#fff' }"
                >
                  {{ item.name }}
                </n-tag>
                <span v-if="!(detail.tags?.length)">未打标签</span>
              </n-space>
            </n-descriptions-item>
            <n-descriptions-item label="自动续订">{{ detail.autoRenew ? '已启用' : '未启用' }}</n-descriptions-item>
            <n-descriptions-item label="订阅频率">每 {{ detail.billingIntervalCount }} {{ unitLabel(detail.billingIntervalUnit) }}</n-descriptions-item>
            <n-descriptions-item label="开始日期">{{ formatDate(detail.startDate) }}</n-descriptions-item>
            <n-descriptions-item label="下次续订">{{ formatDate(detail.nextRenewalDate) }}</n-descriptions-item>
            <n-descriptions-item label="原始金额">{{ formatMoney(detail.amount, detail.currency) }}</n-descriptions-item>
            <n-descriptions-item label="到期前提醒">
              {{ formatReminderRulesText(detail.advanceReminderRules, 'advance') }}
            </n-descriptions-item>
            <n-descriptions-item label="过期提醒">
              {{ formatReminderRulesText(detail.overdueReminderRules, 'overdue') }}
            </n-descriptions-item>
            <n-descriptions-item label="提醒通知">{{ detail.webhookEnabled ? '已启用' : '未启用' }}</n-descriptions-item>
            <n-descriptions-item label="创建时间">{{ formatDateTime(detail.createdAt) }}</n-descriptions-item>
          </n-descriptions>

          <n-card title="描述">
            {{ detail.description || '暂无描述' }}
          </n-card>

          <n-card title="备注">
            {{ detail.notes || '暂无备注' }}
          </n-card>
        </n-space>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NCard, NDescriptions, NDescriptionsItem, NDrawer, NDrawerContent, NEmpty, NSpace, NTag } from 'naive-ui'
import { useSettingsQuery } from '@/composables/settings-query'
import type { SubscriptionDetail } from '@/types/api'
import { resolveLogoUrl } from '@/utils/logo'
import { formatReminderRulesText } from '@/utils/reminder-rules'
import { getSubscriptionStatusTagType, getSubscriptionStatusText } from '@/utils/subscription-status'
import { formatDateInTimezone, formatDateTimeInTimezone } from '@/utils/timezone'

const emit = defineEmits<{ close: [] }>()

defineProps<{
  show: boolean
  detail: SubscriptionDetail | null
}>()

const { width } = useWindowSize()
const { data: settings } = useSettingsQuery()
const drawerWidth = computed(() => (width.value < 760 ? '100%' : 720))
const descriptionColumns = computed(() => (width.value < 760 ? 1 : 2))

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

function formatDate(value: string) {
  return formatDateInTimezone(value, settings.value?.timezone)
}

function formatDateTime(value: string) {
  return formatDateTimeInTimezone(value, settings.value?.timezone)
}

function unitLabel(unit: string) {
  return {
    day: '天',
    week: '周',
    month: '月',
    quarter: '季',
    year: '年'
  }[unit] ?? unit
}

function handleShowUpdate(value: boolean) {
  if (!value) {
    emit('close')
  }
}
</script>

<style scoped>
.detail-logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  object-fit: contain;
  border: 1px solid var(--app-border-soft);
  background: var(--app-surface);
}

.detail-logo--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-weight: 700;
}

.detail-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.detail-site a {
  color: #2563eb;
  word-break: break-all;
}
</style>
