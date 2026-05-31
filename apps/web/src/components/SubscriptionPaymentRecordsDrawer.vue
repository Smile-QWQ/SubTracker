<template>
  <n-drawer :show="show" :width="drawerWidth" @mask-click="$emit('close')" @update:show="handleShowUpdate">
    <n-drawer-content :title="t('subscriptions.paymentRecords.title')" closable>
      <n-empty v-if="records.length === 0" :description="t('subscriptions.paymentRecords.noData')" />
      <n-data-table v-else :columns="columns" :data="records" :pagination="{ pageSize: 8 }" />
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NDataTable, NDrawer, NDrawerContent, NEmpty } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useSettingsQuery } from '@/composables/settings-query'
import type { PaymentRecord } from '@/types/api'
import { formatDateInTimezone, formatDateTimeInTimezone } from '@/utils/timezone'

const emit = defineEmits<{ close: [] }>()

const props = defineProps<{
  show: boolean
  records: PaymentRecord[]
}>()

const { width } = useWindowSize()
const { data: settings } = useSettingsQuery()
const { t } = useI18n()
const drawerWidth = computed(() => (width.value < 760 ? '100%' : 760))

const columns = computed(() => [
  {
    title: t('subscriptions.paymentRecords.renewedAt'),
    key: 'paidAt',
    render: (row: PaymentRecord) => formatDateTimeInTimezone(row.paidAt, settings.value?.timezone)
  },
  {
    title: t('common.labels.amount'),
    key: 'amount',
    render: (row: PaymentRecord) => `${row.currency} ${row.amount.toFixed(2)}`
  },
  {
    title: t('subscriptions.paymentRecords.convertedAmount'),
    key: 'convertedAmount',
    render: (row: PaymentRecord) => `${row.baseCurrency} ${row.convertedAmount.toFixed(2)}`
  },
  {
    title: t('subscriptions.paymentRecords.periodStart'),
    key: 'periodStart',
    render: (row: PaymentRecord) => formatDateInTimezone(row.periodStart, settings.value?.timezone)
  },
  {
    title: t('subscriptions.paymentRecords.periodEnd'),
    key: 'periodEnd',
    render: (row: PaymentRecord) => formatDateInTimezone(row.periodEnd, settings.value?.timezone)
  }
])

function handleShowUpdate(value: boolean) {
  if (!value) {
    emit('close')
  }
}
</script>
