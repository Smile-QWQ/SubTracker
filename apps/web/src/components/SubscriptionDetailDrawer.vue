<template>
  <n-drawer :show="show" :width="drawerWidth" @mask-click="emit('close')" @update:show="handleShowUpdate">
    <n-drawer-content :title="t('subscriptions.detail.title')" closable>
      <n-empty v-if="!detail" :description="t('common.empty.noData')" />
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

          <n-descriptions class="detail-descriptions" label-placement="left" :column="descriptionColumns" bordered>
            <n-descriptions-item :label="t('common.labels.name')">{{ detail.name }}</n-descriptions-item>
            <n-descriptions-item :label="t('common.labels.status')">
              <n-tag :type="getSubscriptionStatusTagType(detail.status)">{{ getSubscriptionStatusText(detail.status) }}</n-tag>
            </n-descriptions-item>
            <n-descriptions-item :label="t('common.labels.tags')">
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
                <span v-if="!(detail.tags?.length)">{{ t('common.empty.noTags') }}</span>
              </n-space>
            </n-descriptions-item>
            <n-descriptions-item
              :label="t('common.labels.autoRenew')"
              :label-style="middleAlignedCellStyle"
              :content-style="middleAlignedCellStyle"
            >
              {{ detail.autoRenew ? t('common.status.enabled') : t('common.status.disabled') }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('subscriptions.labels.interval')">
              {{ t('subscriptions.values.interval', { count: detail.billingIntervalCount, unit: unitLabel(detail.billingIntervalUnit) }) }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('common.labels.startDate')">{{ formatDate(detail.startDate) }}</n-descriptions-item>
            <n-descriptions-item :label="t('common.labels.nextRenewal')">{{ formatDate(detail.nextRenewalDate) }}</n-descriptions-item>
            <n-descriptions-item :label="t('subscriptions.labels.originalAmount')">{{ formatMoney(detail.amount, detail.currency) }}</n-descriptions-item>
            <n-descriptions-item :label="t('subscriptions.labels.currentCycle')" :label-style="middleAlignedCellStyle" :content-style="middleAlignedCellStyle">
              {{ detail.currentCycleStartDate }} ~ {{ detail.currentCycleEndDate }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('subscriptions.labels.remainingValue')">
              <div class="detail-value-block">
                <div class="detail-value-block__amount">
                  {{ formatMoney(detail.remainingValue, detail.remainingValueCurrency) }}
                </div>
                <div class="detail-value-block__meta">
                  {{ t('subscriptions.detail.remainingDays', { days: detail.remainingDays, ratio: formatRatio(detail.remainingRatio) }) }}
                </div>
              </div>
            </n-descriptions-item>
            <n-descriptions-item :label="t('subscriptions.labels.advanceReminders')">
              <n-space v-if="advanceReminderRuleItems.length" vertical size="small">
                <n-tag v-for="item in advanceReminderRuleItems" :key="item.key" size="small" type="info" :bordered="false">
                  {{ item.description }}
                </n-tag>
              </n-space>
              <span v-else>{{ formatReminderRulesText(detail.advanceReminderRules, 'advance') }}</span>
            </n-descriptions-item>
            <n-descriptions-item :label="t('subscriptions.labels.overdueReminders')">
              <n-space v-if="overdueReminderRuleItems.length" vertical size="small">
                <n-tag v-for="item in overdueReminderRuleItems" :key="item.key" size="small" type="warning" :bordered="false">
                  {{ item.description }}
                </n-tag>
              </n-space>
              <span v-else>{{ formatReminderRulesText(detail.overdueReminderRules, 'overdue') }}</span>
            </n-descriptions-item>
            <n-descriptions-item
              :label="t('common.labels.notifications')"
              :label-style="middleAlignedCellStyle"
              :content-style="middleAlignedCellStyle"
            >
              {{ detail.webhookEnabled ? t('common.status.enabled') : t('common.status.disabled') }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('common.labels.createdAt')">{{ formatDateTime(detail.createdAt) }}</n-descriptions-item>
          </n-descriptions>

          <n-card :title="t('common.labels.description')">
            {{ detail.description || t('common.empty.noDescription') }}
          </n-card>

          <n-card :title="t('common.labels.notes')">
            {{ detail.notes || t('common.empty.noNotes') }}
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
import { useI18n } from 'vue-i18n'
import { useSettingsQuery } from '@/composables/settings-query'
import type { SubscriptionDetail } from '@/types/api'
import { resolveLogoUrl } from '@/utils/logo'
import { formatReminderRulesText, listReminderRuleDescriptions } from '@/utils/reminder-rules'
import { getSubscriptionStatusTagType, getSubscriptionStatusText } from '@/utils/subscription-status'
import { formatDateInTimezone, formatDateTimeInTimezone } from '@/utils/timezone'

const emit = defineEmits<{ close: [] }>()

const props = defineProps<{
  show: boolean
  detail: SubscriptionDetail | null
}>()

const { width } = useWindowSize()
const { t } = useI18n()
const { data: settings } = useSettingsQuery()
const drawerWidth = computed(() => (width.value < 760 ? '100%' : 720))
const descriptionColumns = computed(() => (width.value < 760 ? 1 : 2))
const middleAlignedCellStyle = {
  verticalAlign: 'middle'
} as const
const advanceReminderRuleItems = computed(() =>
  listReminderRuleDescriptions(props.detail?.advanceReminderRules, 'advance')
)
const overdueReminderRuleItems = computed(() =>
  listReminderRuleDescriptions(props.detail?.overdueReminderRules, 'overdue')
)

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

function formatRatio(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function formatDate(value: string) {
  return formatDateInTimezone(value, settings.value?.timezone)
}

function formatDateTime(value: string) {
  return formatDateTimeInTimezone(value, settings.value?.timezone)
}

function unitLabel(unit: string) {
  return {
    day: t('common.units.day'),
    week: t('common.units.week'),
    month: t('common.units.month'),
    quarter: t('common.units.quarter'),
    year: t('common.units.year')
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

.detail-value-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-value-block__amount {
  color: var(--app-text-strong);
}

.detail-value-block__meta {
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.detail-descriptions :deep(.n-descriptions-table-header) {
  white-space: nowrap;
  word-break: keep-all;
  width: 132px;
}

.detail-descriptions :deep(.n-descriptions-table-content) {
  vertical-align: top;
}
</style>
