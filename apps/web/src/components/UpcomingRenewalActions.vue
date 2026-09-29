<template>
  <n-space :size="6" :wrap-item="false">
    <n-button
      size="small"
      type="primary"
      ghost
      :loading="renewing"
      :disabled="renewing"
      @click="emit('renew', subscriptionId, name)"
    >{{ t('subscriptions.actions.renew') }}</n-button>
    <n-button
      size="small"
      @click="router.push({ name: 'subscriptions', query: { subscriptionId } })"
    >{{ t('subscriptions.actions.manage') }}</n-button>
  </n-space>
</template>

<script setup lang="ts">
import { NButton, NSpace } from 'naive-ui'
import { useRouter } from 'vue-router'
import { t } from '@/locales'

defineProps<{
  subscriptionId: string
  name: string
  renewing?: boolean
}>()
const emit = defineEmits<{ renew: [id: string, name: string] }>()
const router = useRouter()
</script>
