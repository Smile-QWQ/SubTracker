<template>
  <n-modal
    :show="show"
    preset="card"
    title="Webhook Endpoint"
    style="width: 560px"
    @mask-click="close"
    @update:show="handleUpdateShow"
  >
    <n-form :model="form" label-placement="left" label-width="90">
      <n-form-item label="名称">
        <n-input v-model:value="form.name" />
      </n-form-item>
      <n-form-item label="URL">
        <n-input v-model:value="form.url" placeholder="https://example.com/hook" />
      </n-form-item>
      <n-form-item label="Secret">
        <n-input v-model:value="form.secret" type="password" show-password-on="click" />
      </n-form-item>
      <n-form-item label="事件">
        <n-checkbox-group v-model:value="form.events">
          <n-space vertical>
            <n-checkbox value="subscription.reminder_due">subscription.reminder_due</n-checkbox>
            <n-checkbox value="subscription.overdue">subscription.overdue</n-checkbox>
            <n-checkbox value="subscription.renewed">subscription.renewed</n-checkbox>
            <n-checkbox value="exchange-rate.stale">exchange-rate.stale</n-checkbox>
          </n-space>
        </n-checkbox-group>
      </n-form-item>
      <n-form-item label="启用">
        <n-switch v-model:value="form.enabled" />
      </n-form-item>

      <n-space justify="end">
        <n-button @click="close">取消</n-button>
        <n-button type="primary" @click="onSubmit">保存</n-button>
      </n-space>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  NSwitch
} from 'naive-ui'
import type { WebhookEndpoint } from '@/types/api'

const props = defineProps<{
  show: boolean
  model?: WebhookEndpoint | null
}>()

const emit = defineEmits<{
  close: []
  submit: [payload: Record<string, unknown>, id?: string]
}>()

const form = reactive({
  name: '',
  url: '',
  secret: '',
  enabled: true,
  events: ['subscription.reminder_due'] as string[]
})

watch(
  () => props.model,
  (model) => {
    if (!model) {
      form.name = ''
      form.url = ''
      form.secret = ''
      form.enabled = true
      form.events = ['subscription.reminder_due']
      return
    }

    form.name = model.name
    form.url = model.url
    form.secret = model.secret
    form.enabled = model.enabled
    form.events = model.eventsJson ?? []
  },
  { immediate: true }
)

function onSubmit() {
  emit(
    'submit',
    {
      name: form.name,
      url: form.url,
      secret: form.secret,
      enabled: form.enabled,
      events: form.events
    },
    props.model?.id
  )
}

function close() {
  emit('close')
}

function handleUpdateShow(value: boolean) {
  if (!value) {
    close()
  }
}
</script>
