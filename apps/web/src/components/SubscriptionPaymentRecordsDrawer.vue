<template>
  <n-drawer :show="show" :width="drawerWidth" @mask-click="$emit('close')" @update:show="handleShowUpdate">
    <n-drawer-content title="续订记录" closable>
      <n-empty v-if="records.length === 0" description="暂无续订记录" />
      <n-data-table v-else :columns="columns" :data="records" :pagination="{ pageSize: 8 }" />
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NDataTable, NDrawer, NDrawerContent, NEmpty } from 'naive-ui'
import type { PaymentRecord } from '@/types/api'

const emit = defineEmits<{ close: [] }>()

const props = defineProps<{
  show: boolean
  records: PaymentRecord[]
}>()

const { width } = useWindowSize()
const drawerWidth = computed(() => (width.value < 760 ? '100%' : 760))

const columns = [
  {
    title: '续订时间',
    key: 'paidAt',
    render: (row: PaymentRecord) => dayjs(row.paidAt).format('YYYY-MM-DD HH:mm:ss')
  },
  {
    title: '金额',
    key: 'amount',
    render: (row: PaymentRecord) => `${row.currency} ${row.amount.toFixed(2)}`
  },
  {
    title: '折算金额',
    key: 'convertedAmount',
    render: (row: PaymentRecord) => `${row.baseCurrency} ${row.convertedAmount.toFixed(2)}`
  },
  {
    title: '周期开始',
    key: 'periodStart',
    render: (row: PaymentRecord) => dayjs(row.periodStart).format('YYYY-MM-DD')
  },
  {
    title: '周期结束',
    key: 'periodEnd',
    render: (row: PaymentRecord) => dayjs(row.periodEnd).format('YYYY-MM-DD')
  }
]

function handleShowUpdate(value: boolean) {
  if (!value) {
    emit('close')
  }
}
</script>
