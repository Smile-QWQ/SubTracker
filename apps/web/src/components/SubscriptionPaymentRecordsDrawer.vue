<template>
  <n-drawer :show="show" :width="drawerWidth" :close-on-esc="!editing" :mask-closable="!editing" @update:show="value => !value && !editing && emit('close')">
    <n-drawer-content :title="t('paymentHistory.title')" :closable="!editing">
      <payment-history-panel v-if="show && subscriptionId" :key="subscriptionId" :subscription-id="subscriptionId" @update:editing="editing = $event" @changed="emit('changed')" />
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NDrawer, NDrawerContent } from 'naive-ui'
import { t } from '@/locales'
import PaymentHistoryPanel from './PaymentHistoryPanel.vue'

const emit = defineEmits<{ close: []; changed: [] }>()
defineProps<{ show: boolean; subscriptionId: string }>()
const { width } = useWindowSize()
const drawerWidth = computed(() => width.value < 960 ? '100%' : 960)
const editing = ref(false)
</script>
