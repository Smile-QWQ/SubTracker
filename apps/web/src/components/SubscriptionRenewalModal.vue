<template>
  <n-modal :show="show" preset="card" :title="batch ? t('subscriptions.renewal.batchTitle', { count: subscriptions.length }) : t('subscriptions.renewal.title')"
    style="width: min(700px, calc(100vw - 24px))" :mask-closable="!saving" :close-on-esc="!saving" :closable="!saving" @update:show="close">
    <n-space vertical :size="16">
      <n-alert type="info" :show-icon="false">{{ t('subscriptions.renewal.hint') }}</n-alert>
      <n-text v-if="batch">{{ t('subscriptions.renewal.batchHint') }}</n-text>
      <n-button v-if="batch" secondary :disabled="saving" @click="expanded = !expanded">
        {{ expanded ? t('subscriptions.renewal.hideAmounts') : t('subscriptions.renewal.adjustAmounts') }}
        <template v-if="changedCount"> ({{ changedCount }})</template>
      </n-button>
      <div v-if="!batch || expanded" class="renewal-entries">
        <div v-for="entry in entries" :key="entry.id" class="renewal-entry">
          <div class="renewal-name"><n-text strong>{{ entry.name }}</n-text><n-text depth="3">{{ t('subscriptions.renewal.listPrice', { price: `${entry.originalCurrency} ${entry.originalAmount}` }) }}</n-text></div>
          <n-form :disabled="saving" :show-feedback="false" class="renewal-fields">
            <n-form-item :label="t('subscriptions.renewal.paidAmount')">
              <n-input-number v-model:value="entry.amount" :min="0" :max="1e12" :show-button="false" :input-props="{ 'aria-label': `${entry.name} ${t('subscriptions.renewal.paidAmount')}` }" />
            </n-form-item>
            <n-form-item :label="t('common.labels.currency')"><n-select v-model:value="entry.currency" :options="currencyOptions" filterable /></n-form-item>
          </n-form>
          <n-text v-if="errors[entry.id]" type="error">{{ errors[entry.id] }}</n-text>
        </div>
      </div>
      <n-alert v-if="invalid" type="error">{{ t('subscriptions.renewal.invalidAmount') }}</n-alert>
    </n-space>
    <template #footer><n-space justify="end">
      <n-button :disabled="saving" @click="close(false)">{{ t('common.actions.cancel') }}</n-button>
      <n-button type="primary" :loading="saving" :disabled="saving" @click="submit">{{ t('subscriptions.renewal.confirm') }}</n-button>
    </n-space></template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInputNumber, NModal, NSelect, NSpace, NText } from 'naive-ui'
import { RenewalPaymentOverrideSchema, type RenewalPaymentOverride } from '@subtracker/shared'
import type { Subscription } from '@/types/api'
import { useExchangeRateSnapshotQuery } from '@/composables/exchange-rate-query'
import { t } from '@/locales'
import { buildCurrencyOptions } from '@/utils/currency'

const props = withDefaults(defineProps<{ show: boolean; subscriptions: Subscription[]; batch: boolean; saving: boolean; errors?: Record<string, string> }>(), { errors: () => ({}) })
const emit = defineEmits<{ close: []; confirm: [payments: RenewalPaymentOverride[]] }>()
const { data: snapshot } = useExchangeRateSnapshotQuery()
type Entry = { id: string; name: string; amount: number | null; currency: string; originalAmount: number; originalCurrency: string }
const entries = ref<Entry[]>([])
const expanded = ref(false)
const invalid = ref(false)
const changed = (entry: Entry) => entry.amount !== entry.originalAmount || entry.currency !== entry.originalCurrency
const changedCount = computed(() => entries.value.filter(changed).length)
const currencyOptions = computed(() => buildCurrencyOptions(Array.from(new Set([
  ...(snapshot.value ? [snapshot.value.baseCurrency, ...Object.keys(snapshot.value.rates)] : ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD']),
  ...entries.value.flatMap(entry => [entry.currency, entry.originalCurrency])
])).filter(code => /^[A-Z]{3}$/.test(code)).sort()))
watch(() => [props.show, props.subscriptions] as const, ([show]) => {
  if (!show) { entries.value = []; expanded.value = false; invalid.value = false; return }
  const previous = new Map(entries.value.map(entry => [entry.id, entry]))
  entries.value = props.subscriptions.map(row => previous.get(row.id) ?? { id: row.id, name: row.name, amount: row.amount, currency: row.currency, originalAmount: row.amount, originalCurrency: row.currency })
  if (Object.keys(props.errors).length) expanded.value = true
}, { immediate: true })
function close(show: boolean) { if (!show && !props.saving) emit('close') }
function submit() {
  if (props.saving) return
  const parsed = RenewalPaymentOverrideSchema.array().min(1).safeParse(entries.value.map(({ id, amount, currency }) => ({ id, amount, currency })))
  invalid.value = !parsed.success
  if (!parsed.success) { expanded.value = true; return }
  // Untouched batch entries continue using their own current subscription price.
  emit('confirm', props.batch ? parsed.data.filter(payment => changed(entries.value.find(entry => entry.id === payment.id)!)) : parsed.data)
}
</script>

<style scoped>
.renewal-entries { max-height: 55vh; overflow-y: auto; }
.renewal-entry + .renewal-entry { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.renewal-name { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; overflow-wrap: anywhere; }
.renewal-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
@media (max-width: 480px) { .renewal-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
