<template>
  <div>
    <page-header
      title="费用统计"
      subtitle="从标签、月份、币种维度分析支出"
      :icon="barChartOutline"
      icon-background="linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)"
    />

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12">
      <n-grid-item>
        <n-card title="月度趋势">
          <chart-view v-if="trendOption" :option="trendOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="标签占比">
          <chart-view v-if="categoryOption" :option="categoryOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card title="币种分布">
          <n-data-table :columns="currencyColumns" :data="overview?.currencyDistribution ?? []" :pagination="false" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="即将续订金额（30 天）">
          <n-data-table :columns="upcomingColumns" :data="overview?.upcomingRenewals ?? []" :pagination="false" />
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useWindowSize } from '@vueuse/core'
import { NCard, NDataTable, NEmpty, NGrid, NGridItem } from 'naive-ui'
import { BarChartOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import ChartView from '@/components/ChartView.vue'
import PageHeader from '@/components/PageHeader.vue'
import type { StatisticsOverview } from '@/types/api'

const { width } = useWindowSize()
const barChartOutline = BarChartOutline

const { data: overview } = useQuery({
  queryKey: ['statistics-overview-full'],
  queryFn: api.getStatisticsOverview
})

const { data: settings } = useQuery({
  queryKey: ['settings-currency'],
  queryFn: api.getSettings
})

const baseCurrency = computed(() => settings.value?.baseCurrency ?? 'CNY')
const gridCols = computed(() => (width.value < 1100 ? 1 : 2))

const trendOption = computed(() => {
  if (!overview.value?.monthlyTrend.length) return null
  return {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: overview.value.monthlyTrend.map((item) => item.month)
    },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'bar',
        data: overview.value.monthlyTrend.map((item) => item.amount),
        itemStyle: { color: '#3b82f6' }
      }
    ]
  }
})

const categoryOption = computed(() => {
  if (!overview.value?.tagSpend.length) return null
  return {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        data: overview.value.tagSpend
      }
    ]
  }
})

const currencyColumns = [
  { title: '货币', key: 'currency' },
  {
    title: '金额',
    key: 'amount',
    render: (row: StatisticsOverview['currencyDistribution'][number]) => `${row.currency} ${Number(row.amount).toFixed(2)}`
  }
]

const upcomingColumns = [
  { title: '订阅', key: 'name' },
  {
    title: '日期',
    key: 'nextRenewalDate',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => dayjs(row.nextRenewalDate).format('YYYY-MM-DD')
  },
  {
    title: '原始金额',
    key: 'amount',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => `${row.currency} ${Number(row.amount).toFixed(2)}`
  },
  {
    title: '折算金额',
    key: 'convertedAmount',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => `${baseCurrency.value} ${Number(row.convertedAmount).toFixed(2)}`
  }
]
</script>
