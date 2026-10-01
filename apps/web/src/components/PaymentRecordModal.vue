<template>
  <n-modal :show="show" preset="card" :title="t(record ? 'paymentHistory.edit' : 'paymentHistory.add')" class="payment-modal" style="width: min(680px, calc(100vw - 24px))" :mask-closable="!saving" :close-on-esc="!saving" :closable="!saving" @update:show="value => !value && emit('close')">
    <n-alert type="info" :show-icon="false" style="margin-bottom: 16px">{{ t('paymentHistory.independent') }}</n-alert>
    <n-form label-placement="top" @submit.prevent="save">
      <n-form-item :label="t('paymentHistory.subscription')">
        <n-select v-model:value="form.subscriptionId" :options="subscriptionOptions" filterable :disabled="!!record || !!subscriptionId || saving" />
      </n-form-item>
      <div class="payment-fields">
        <n-form-item :label="t('paymentHistory.amount')"><n-input-number v-model:value="form.amount" :min="0" :max="1e12" :disabled="saving" style="width:100%" /></n-form-item>
        <n-form-item :label="t('paymentHistory.currency')"><n-select v-model:value="form.currency" :options="currencyOptions" filterable :disabled="saving" :placeholder="t('subscriptions.form.currencyPlaceholder')" /></n-form-item>
        <n-form-item :label="t('paymentHistory.paidAt')"><n-date-picker v-model:formatted-value="form.paidAt" value-format="yyyy-MM-dd" type="date" :disabled="saving" style="width:100%" /></n-form-item>
        <n-form-item :label="t('paymentHistory.conversion')"><n-select v-model:value="form.mode" :options="conversionOptions" :disabled="saving" /></n-form-item>
        <n-form-item :label="t('paymentHistory.baseCurrency')"><n-select v-model:value="form.baseCurrency" :options="currencyOptions" filterable :disabled="form.mode === 'preserve' || saving" :placeholder="t('subscriptions.form.currencyPlaceholder')" /></n-form-item>
        <n-form-item v-if="form.mode !== 'current'" :label="t('paymentHistory.rate')"><n-input-number v-model:value="form.exchangeRate" :min="0" :disabled="form.mode === 'preserve' || saving" style="width:100%" /></n-form-item>
        <n-form-item :label="t('paymentHistory.periodStart')"><n-date-picker v-model:formatted-value="form.periodStart" value-format="yyyy-MM-dd" type="date" :disabled="saving" style="width:100%" /></n-form-item>
        <n-form-item :label="t('paymentHistory.periodEnd')"><n-date-picker v-model:formatted-value="form.periodEnd" value-format="yyyy-MM-dd" type="date" :disabled="saving" style="width:100%" /></n-form-item>
      </div>
      <p class="card-muted">{{ t(form.mode === 'preserve' ? 'paymentHistory.preserveHint' : 'paymentHistory.currentHint') }}</p>
      <n-form-item :label="t('paymentHistory.note')"><n-input v-model:value="form.note" type="textarea" maxlength="1000" :disabled="saving" /></n-form-item>
      <n-checkbox v-if="record && record.source !== 'manual'" v-model:checked="form.confirmManual" :disabled="saving">{{ t('paymentHistory.confirmManual') }}</n-checkbox>
      <n-space justify="end" style="margin-top:16px">
        <n-button :disabled="saving" @click="emit('close')">{{ t('common.actions.cancel') }}</n-button>
        <n-button type="primary" attr-type="submit" :loading="saving" :disabled="saving" @click="save">{{ t('common.actions.save') }}</n-button>
      </n-space>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { NAlert, NButton, NCheckbox, NDatePicker, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSpace } from 'naive-ui'
import { PaymentInputSchema, type PaymentHistoryRecord } from '@subtracker/shared'
import { api } from '@/composables/api'
import { useSettingsQuery } from '@/composables/settings-query'
import { useExchangeRateSnapshotQuery } from '@/composables/exchange-rate-query'
import { buildCurrencyOptions } from '@/utils/currency'
import { formatDateInTimezone } from '@/utils/timezone'
import { useLocalizedMessage } from '@/utils/localized-message'
import { t } from '@/locales'
import type { Subscription } from '@/types/api'

const props = defineProps<{ show: boolean; record: PaymentHistoryRecord | null; subscriptionId?: string; subscriptions: Subscription[] }>()
const emit = defineEmits<{ close: []; saved: []; 'update:saving': [value: boolean] }>()
const { data: settings } = useSettingsQuery()
const { data: snapshot } = useExchangeRateSnapshotQuery()
const message = useLocalizedMessage()
const saving = ref(false)
const form = reactive({ subscriptionId: '', amount: 0 as number | null, currency: 'CNY', baseCurrency: 'CNY', exchangeRate: 1 as number | null,
  paidAt: '', periodStart: '', periodEnd: '', mode: 'current' as 'current' | 'manual' | 'preserve', note: '', confirmManual: false })
const currencyOptions = computed(() => buildCurrencyOptions(Array.from(new Set([
  ...(snapshot.value ? [snapshot.value.baseCurrency, ...Object.keys(snapshot.value.rates)] : ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD']),
  settings.value?.baseCurrency ?? 'CNY', form.currency, form.baseCurrency
])).filter(code => /^[A-Z]{3}$/.test(code)).sort()))
const subscriptionOptions = computed(() => props.subscriptions.map(row => ({ label: row.name, value: row.id })))
const conversionOptions = computed(() => [
  ...(props.record ? [{ label: t('paymentHistory.preserve'), value: 'preserve' }] : []),
  { label: t('paymentHistory.manualRate'), value: 'manual' }, { label: t('paymentHistory.current'), value: 'current' }
])
watch(() => props.show, show => {
  if (!show) return
  const record = props.record
  const subscription = props.subscriptions.find(row => row.id === (record?.subscriptionId ?? props.subscriptionId))
  const date = formatDateInTimezone(new Date().toISOString(), settings.value?.timezone)
  Object.assign(form, { subscriptionId: record?.subscriptionId ?? props.subscriptionId ?? '',
    amount: record?.amount ?? subscription?.amount ?? 0, currency: record?.currency ?? subscription?.currency ?? settings.value?.baseCurrency ?? 'CNY',
    baseCurrency: record?.baseCurrency ?? settings.value?.baseCurrency ?? 'CNY', exchangeRate: record?.exchangeRate ?? 1,
    paidAt: record ? formatDateInTimezone(record.paidAt, settings.value?.timezone) : date,
    periodStart: record ? formatDateInTimezone(record.periodStart, settings.value?.timezone) : date,
    periodEnd: record ? formatDateInTimezone(record.periodEnd, settings.value?.timezone) : date,
    mode: record ? 'preserve' : 'current', note: record?.note ?? '', confirmManual: false })
}, { immediate: true })
async function save() {
  if (saving.value) return
  const parsed = PaymentInputSchema.safeParse({ ...form, currency: form.currency.trim(),
    conversion: form.mode === 'preserve' ? { mode: 'preserve' } : { mode: form.mode, baseCurrency: form.baseCurrency.trim(), exchangeRate: form.exchangeRate } })
  if (!parsed.success || !form.subscriptionId) { message.error(t('paymentHistory.errors.invalid')); return }
  saving.value = true
  emit('update:saving', true)
  try {
    if (props.record) await api.updatePaymentRecord(props.record.id, { ...parsed.data, revision: props.record.revision })
    else await api.createPaymentRecord({ ...parsed.data, subscriptionId: form.subscriptionId })
    message.success(t('paymentHistory.saved'))
    emit('saved'); emit('close')
  } catch (error) { message.error(error instanceof Error ? error.message : t('common.errors.requestFailed')) }
  finally { saving.value = false; emit('update:saving', false) }
}
</script>

<style scoped>
.payment-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
@media (max-width: 560px) { .payment-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
