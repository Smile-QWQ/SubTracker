<template>
  <div class="payment-history">
    <n-alert type="info" :show-icon="false">{{ t('paymentHistory.hint') }}</n-alert>
    <div class="payment-filters">
      <n-select v-if="!subscriptionId" v-model:value="filters.subscriptionId" :options="subscriptionOptions" :placeholder="t('paymentHistory.allSubscriptions')" filterable clearable />
      <n-select v-model:value="filters.source" :options="sourceOptions" :placeholder="t('paymentHistory.allSources')" clearable />
      <n-date-picker v-model:formatted-value="filters.from" type="date" value-format="yyyy-MM-dd" :placeholder="t('paymentHistory.from')" clearable />
      <n-date-picker v-model:formatted-value="filters.to" type="date" value-format="yyyy-MM-dd" :placeholder="t('paymentHistory.to')" clearable />
    </div>
    <n-alert v-if="invalidDates" type="warning">{{ t('paymentHistory.errors.period') }}</n-alert>
    <n-alert v-if="loadError" type="error">{{ loadError }}</n-alert>
    <n-spin :show="summaryQuery.isFetching.value">
      <div class="payment-totals">
        <n-card size="small" :title="t('paymentHistory.total')">
          <div v-for="total in summary?.totals" :key="total.currency" class="payment-total-row">
            <strong>{{ money(total.amount, total.currency) }}</strong>
            <div class="card-muted">{{ t('paymentHistory.sourceCounts', { manual: total.manual, automatic: total.automatic, legacy: total.legacy }) }}</div>
          </div>
          <n-empty v-if="!summary?.count" :description="t('paymentHistory.empty')" />
          <div class="card-muted">{{ t('paymentHistory.count', { count: summary?.count ?? 0 }) }}</div>
        </n-card>
        <n-card size="small" :title="t('paymentHistory.year')">
          <div v-for="total in summary?.thisYear" :key="total.currency" class="payment-total-row"><strong>{{ money(total.amount, total.currency) }}</strong> · {{ t('paymentHistory.count', {count:total.count}) }}</div>
          <n-empty v-if="!summary?.thisYear.length" :description="t('paymentHistory.empty')" />
        </n-card>
      </div>
    </n-spin>
    <div class="card-muted">{{ t('paymentHistory.filterScope') }}</div>
    <template v-if="charts && summary?.count">
      <n-space align="center" style="margin:16px 0 8px">
        <span>{{ t('paymentHistory.chartCurrency') }}</span>
        <n-select v-model:value="chartCurrency" :options="currencyOptions" style="width:110px" />
      </n-space>
      <div class="payment-charts">
        <n-card size="small" :title="t('paymentHistory.trend')">
          <chart-view :option="trendOption" @click="drillMonth" />
        </n-card>
        <n-card size="small" :title="t('paymentHistory.ranking')">
          <n-space vertical>
            <n-button v-for="row in ranked" :key="row.id" text class="payment-ranking" @click="drillSubscription(row.id)">
              <span class="payment-name">{{ row.name }}</span><strong>{{ money(row.amount, row.currency) }}</strong>
            </n-button>
          </n-space>
        </n-card>
      </div>
      <div class="card-muted">{{ t('paymentHistory.chartHint') }}</div>
    </template>
    <div ref="detailsElement" class="payment-detail-heading">
      <strong>{{ t('paymentHistory.details') }}</strong>
      <n-space>
        <n-button v-if="drill.month || drill.subscriptionId" size="small" @click="clearDrill">{{ t('paymentHistory.clearDrilldown') }} {{ drill.month }}</n-button>
        <n-button type="primary" size="small" @click="openEditor(null)">{{ t('paymentHistory.add') }}</n-button>
      </n-space>
    </div>
    <n-spin :show="recordsQuery.isFetching.value">
      <n-data-table v-if="!isMobile" :data="records" :columns="columns" :row-key="row => row.id" :scroll-x="1165" />
      <n-space v-else vertical>
        <n-card v-for="row in records" :key="row.id" size="small">
          <div class="payment-detail-heading"><strong class="payment-name">{{ row.subscription.name }}</strong><span>{{ money(row.amount, row.currency) }}</span></div>
          <div>{{ date(row.paidAt) }} · {{ t(`paymentHistory.${row.source}`) }}</div>
          <div class="card-muted">{{ t('paymentHistory.converted') }}: {{ money(row.convertedAmount, row.baseCurrency) }} · {{ rateLabel(row) }}</div>
          <div class="card-muted">{{ date(row.periodStart) }} → {{ date(row.periodEnd) }}</div>
          <div v-if="row.note" class="payment-note">{{ row.note }}</div>
          <n-space justify="end" style="margin-top:8px"><n-button size="small" ghost @click="openEditor(row)">{{ t('common.actions.edit') }}</n-button><n-button size="small" ghost type="error" :disabled="deleting" @click="remove(row)">{{ t('common.actions.delete') }}</n-button></n-space>
        </n-card>
        <n-empty v-if="!records.length" :description="t('paymentHistory.empty')" />
      </n-space>
    </n-spin>
    <n-pagination v-model:page="page" :page-size="20" :item-count="recordsQuery.data.value?.total ?? 0" :simple="isMobile" :page-slot="5" style="margin-top:16px" />
    <p class="card-muted">{{ t('paymentHistory.retention') }}</p>
    <payment-record-modal :show="editorOpen" :record="editing" :subscription-id="subscriptionId" :subscriptions="subscriptions" @close="editorOpen = false" @saved="refresh" />
    <n-modal :show="!!deleteTarget" style="width: min(450px, calc(100vw - 24px))" preset="dialog" type="warning" :title="t('paymentHistory.deleteTitle')" :content="t('paymentHistory.deleteHint')"
      :positive-text="t('common.actions.delete')" :negative-text="t('common.actions.cancel')" :loading="deleting"
      :positive-button-props="{ type: 'error', disabled: deleting }" :negative-button-props="{ disabled: deleting }"
      :mask-closable="!deleting" :close-on-esc="!deleting" :closable="!deleting"
      @update:show="value => { if (!value && !deleting) deleteTarget = null }" @positive-click="confirmDelete" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, nextTick, reactive, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NAlert, NButton, NCard, NDataTable, NDatePicker, NEmpty, NPagination, NSelect, NSpace, NSpin, NModal, useThemeVars, type DataTableColumns } from 'naive-ui'
import type { PaymentHistoryRecord, PaymentQuery, PaymentSource } from '@subtracker/shared'
import { api } from '@/composables/api'
import { useSettingsQuery } from '@/composables/settings-query'
import { formatDateInTimezone } from '@/utils/timezone'
import { useLocalizedMessage } from '@/utils/localized-message'
import { t } from '@/locales'
import ChartView from './ChartView.vue'
import PaymentRecordModal from './PaymentRecordModal.vue'

const props = withDefaults(defineProps<{ subscriptionId?: string; charts?: boolean }>(), { charts: false })
const emit = defineEmits<{ 'update:editing': [value: boolean]; changed: [] }>()
const { data: settings } = useSettingsQuery()
const { width } = useWindowSize()
const isMobile = computed(() => width.value < 760)
const theme = useThemeVars()
const client = useQueryClient()
const message = useLocalizedMessage()
const page = ref(1)
const filters = reactive({ subscriptionId: null as string | null, source: null as PaymentSource | null, from: null as string | null, to: null as string | null })
const invalidDates = computed(() => !!filters.from && !!filters.to && filters.from > filters.to)
const query = computed<Partial<PaymentQuery>>(() => ({ subscriptionId: props.subscriptionId || filters.subscriptionId || undefined,
  source: filters.source || undefined, from: filters.from || undefined, to: filters.to || undefined }))
const drill = reactive({ month: '', subscriptionId: '' })
const chartCurrency = ref('')
const detailsQuery = computed<Partial<PaymentQuery>>(() => {
  const result = { ...query.value, page: page.value, pageSize: 20 }
  if (drill.month) {
    const end = new Date(`${drill.month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0)
    const from = `${drill.month}-01`, to = end.toISOString().slice(0, 10)
    result.from = result.from && result.from > from ? result.from : from
    result.to = result.to && result.to < to ? result.to : to
  }
  if (drill.subscriptionId) result.subscriptionId = drill.subscriptionId
  if (drill.month || drill.subscriptionId) result.baseCurrency = chartCurrency.value
  return result
})
const summaryQuery = useQuery({ queryKey: computed(() => ['payment-history', 'summary', query.value]), queryFn: () => api.getPaymentSummary(query.value), enabled: computed(() => !invalidDates.value) })
const recordsQuery = useQuery({ queryKey: computed(() => ['payment-history', 'records', detailsQuery.value]), queryFn: () => api.getPaymentRecords(detailsQuery.value), enabled: computed(() => !invalidDates.value) })
const subscriptionsQuery = useQuery({ queryKey: ['payment-history', 'subscriptions'], queryFn: () => api.getSubscriptions() })
const loadError = computed(() => summaryQuery.error.value?.message || recordsQuery.error.value?.message || subscriptionsQuery.error.value?.message)
const subscriptions = computed(() => subscriptionsQuery.data.value ?? [])
const subscriptionOptions = computed(() => subscriptions.value.map(row => ({ value: row.id, label: row.name })))
const sourceOptions = computed(() => ['manual', 'automatic', 'legacy'].map(source => ({ value: source, label: t(`paymentHistory.${source}`) })))
const summary = computed(() => summaryQuery.data.value)
const records = computed(() => recordsQuery.data.value?.items ?? [])
const currencyOptions = computed(() => (summary.value?.totals ?? []).map(row => ({ label: row.currency, value: row.currency })))
watch(currencyOptions, options => { if (!options.some(row => row.value === chartCurrency.value)) chartCurrency.value = options.find(row => row.value === settings.value?.baseCurrency)?.value ?? options[0]?.value ?? '' }, { immediate: true })
watch(() => JSON.stringify(query.value), () => { page.value = 1; clearDrill() })
watch(() => recordsQuery.data.value?.page, value => { if (value) page.value = value })
watch(chartCurrency, () => clearDrill())
const date = (value: string) => formatDateInTimezone(value, settings.value?.timezone)
const money = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`
const rateLabel = (row: PaymentHistoryRecord) => t(`paymentHistory.${row.rateSource === 'manual' ? 'manualRateSource' : row.rateSource === 'current' ? 'currentRateSource' : 'legacyRateSource'}`)
const ranked = computed(() => (summary.value?.subscriptions ?? []).filter(row => row.currency === chartCurrency.value).slice(0, 10))
const months = computed(() => {
  const points = (summary.value?.monthly ?? []).filter(row => row.currency === chartCurrency.value)
  if (!points.length) return []
  const end = new Date(`${points[points.length - 1]!.month}-01T00:00:00Z`)
  const result: Array<{ month: string; amount: number }> = []
  for (let i = 11; i >= 0; i--) {
    const date = new Date(end); date.setUTCMonth(end.getUTCMonth() - i)
    const month = date.toISOString().slice(0, 7)
    result.push({ month, amount: points.find(point => point.month === month)?.amount ?? 0 })
  }
  return result
})
const trendOption = computed(() => ({
  tooltip: { trigger: 'axis', confine: true, backgroundColor: theme.value.cardColor, textStyle: { color: theme.value.textColor2 } },
  grid: { left: 60, right: 15, bottom: 50, top: 25 },
  xAxis: { type: 'category', data: months.value.map(row => row.month), axisLabel: { color: theme.value.textColor3 } },
  yAxis: { type: 'value', axisLabel: { color: theme.value.textColor3 } },
  series: [{ name: chartCurrency.value, type: 'bar', data: months.value.map(row => row.amount), itemStyle: { color: theme.value.primaryColor } }]
}))
const detailsElement = ref<HTMLElement>()
async function scrollDetails() { page.value = 1; await nextTick(); detailsElement.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) }
function drillMonth(event: { name?: string }) {
  if (!event.name || !months.value.some(row => row.month === event.name)) return
  // Empty chart months outside an explicit date range must not create an inverted filter.
  if ((filters.from && `${event.name}-31` < filters.from) || (filters.to && `${event.name}-01` > filters.to)) return
  drill.month = event.name; drill.subscriptionId = ''; void scrollDetails()
}
function drillSubscription(id: string) { drill.subscriptionId = id; drill.month = ''; void scrollDetails() }
function clearDrill() { drill.month = ''; drill.subscriptionId = ''; page.value = 1 }
const editing = ref<PaymentHistoryRecord | null>(null)
const editorOpen = ref(false)
const deleting = ref(false)
const deleteTarget = ref<PaymentHistoryRecord | null>(null)
watch(() => editorOpen.value || !!deleteTarget.value, value => emit('update:editing', value))
function openEditor(row: PaymentHistoryRecord | null) { editing.value = row; editorOpen.value = true }
async function refresh() {
  await Promise.all(['payment-history', 'subscriptions', 'subscription-detail', 'statistics', 'dashboard'].map(key => client.invalidateQueries({ queryKey: [key] })))
  emit('changed')
}
function remove(row: PaymentHistoryRecord) { deleteTarget.value = row }
async function confirmDelete() {
  const row = deleteTarget.value
  if (!row || deleting.value) return false
  deleting.value = true
  try {
    await api.deletePaymentRecord(row.id, row.revision)
    message.success(t('paymentHistory.deleted'))
    deleteTarget.value = null
    await refresh()
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('common.errors.requestFailed'))
    return false
  } finally { deleting.value = false }
}
const columns = computed<DataTableColumns<PaymentHistoryRecord>>(() => [
  { key: 'subscription', title: t('paymentHistory.subscription'), width: 150, render: row => row.subscription.name },
  { key: 'paidAt', title: t('paymentHistory.paidAt'), width: 120, render: row => date(row.paidAt) },
  { key: 'amount', title: t('paymentHistory.amount'), width: 125, render: row => money(row.amount, row.currency) },
  { key: 'converted', title: t('paymentHistory.converted'), width: 155, render: row => h('div', [money(row.convertedAmount, row.baseCurrency), h('div', {class:'card-muted'}, `${rateLabel(row)} · ${row.exchangeRate}`)]) },
  { key: 'source', title: t('paymentHistory.source'), width: 165, render: row => t(`paymentHistory.${row.source}`) },
  { key: 'period', title: t('subscriptions.paymentRecords.periodStart'), width: 130, render: row => `${date(row.periodStart)} → ${date(row.periodEnd)}` },
  { key: 'note', title: t('paymentHistory.note'), width: 180, ellipsis: { tooltip: true } },
  { key: 'actions', title: t('common.labels.actions'), width: 140, fixed: 'right', render: row => h(NSpace, { size: 8 }, { default: () => [
    h(NButton, { size: 'small', ghost: true, onClick: () => openEditor(row) }, { default: () => t('common.actions.edit') }),
    h(NButton, { size: 'small', ghost: true, type: 'error', disabled: deleting.value, onClick: () => remove(row) }, { default: () => t('common.actions.delete') })
  ] }) }
])
</script>

<style scoped>
.payment-history { min-width: 0; }
.payment-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 16px 0; }
.payment-totals, .payment-charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px 0; }
.payment-total-row { margin-bottom: 8px; }
.payment-detail-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 12px 0; scroll-margin-top: 20px; }
.payment-ranking { width: 100%; }
.payment-ranking :deep(.n-button__content) { width: 100%; justify-content: space-between; gap: 12px; }
.payment-name { overflow-wrap: anywhere; white-space: normal; min-width: 0; }
.payment-note { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 8px; }
@media (max-width: 1100px) { .payment-charts { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .payment-totals, .payment-filters { grid-template-columns: minmax(0, 1fr); } }
</style>
