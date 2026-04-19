<template>
  <div>
    <page-header
      title="费用统计"
      subtitle="从趋势、结构和风险三个维度分析订阅支出"
      :icon="barChartOutline"
      icon-background="linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)"
    />

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12">
      <n-grid-item>
        <n-card title="月支付趋势（未来12个月）">
          <chart-view v-if="trendOption" :option="trendOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="标签月度支出占比">
          <chart-view v-if="tagSpendOption" :option="tagSpendOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card title="状态分布">
          <chart-view v-if="statusOption" :option="statusOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="自动续订占比">
          <chart-view v-if="renewalModeOption" :option="renewalModeOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card title="订阅币种分布">
          <chart-view v-if="currencyOption" :option="currencyOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="未来30天续订分布">
          <chart-view v-if="upcoming30Option" :option="upcoming30Option" />
          <n-empty v-else description="未来30天暂无续订" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="1" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card title="月订阅支出 TOP10">
          <chart-view v-if="topSubscriptionsOption" :option="topSubscriptionsOption" />
          <n-empty v-else description="暂无数据" />
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
import { NCard, NEmpty, NGrid, NGridItem } from 'naive-ui'
import { BarChartOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import ChartView from '@/components/ChartView.vue'
import PageHeader from '@/components/PageHeader.vue'
import type { StatisticsOverview, SubscriptionStatus } from '@/types/api'
import { buildTopSubscriptionsOption } from '@/utils/statistics-top-subscriptions'

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

const statusLabelMap: Record<SubscriptionStatus, string> = {
  active: '正常',
  paused: '暂停',
  cancelled: '停用',
  expired: '过期'
}

const statusColorMap: Record<SubscriptionStatus, string> = {
  active: '#16a34a',
  paused: '#f59e0b',
  cancelled: '#f97316',
  expired: '#ef4444'
}

const trendOption = computed(() => {
  if (!overview.value?.monthlyTrend.length) return null

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['预测金额'] },
    xAxis: {
      type: 'category',
      data: overview.value.monthlyTrend.map((item) => item.month)
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: '预测金额',
        type: 'line',
        smooth: true,
        areaStyle: {},
        itemStyle: { color: '#2563eb' },
        lineStyle: { color: '#2563eb' },
        data: overview.value.monthlyTrend.map((item) => item.amount)
      }
    ]
  }
})

const tagSpendOption = computed(() => {
  if (!overview.value?.tagSpend.length) return null
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['38%', '68%'],
        data: overview.value.tagSpend
      }
    ]
  }
})

const statusOption = computed(() => {
  const data = overview.value?.statusDistribution.filter((item) => item.count > 0) ?? []
  if (!data.length) return null

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: data.map((item) => statusLabelMap[item.status])
    },
    series: [
      {
        type: 'bar',
        data: data.map((item) => ({
          value: item.count,
          itemStyle: { color: statusColorMap[item.status] }
        })),
        barMaxWidth: 32
      }
    ]
  }
})

const renewalModeOption = computed(() => {
  const data = overview.value?.renewalModeDistribution.filter((item) => item.count > 0) ?? []
  if (!data.length) return null

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: { data: { count: number; amount: number; name: string } }) =>
        `${params.data.name}<br/>订阅数：${params.data.count}<br/>月度金额：${formatMoney(params.data.amount, baseCurrency.value)}`
    },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        data: data.map((item) => ({
          name: item.autoRenew ? '自动续订' : '手动续订',
          value: item.count,
          count: item.count,
          amount: item.amount,
          itemStyle: {
            color: item.autoRenew ? '#3b82f6' : '#f59e0b'
          }
        }))
      }
    ]
  }
})

const currencyOption = computed(() => {
  const data = overview.value?.currencyDistribution ?? []
  if (!data.length) return null

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 24, top: 20, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: data.map((item) => item.currency)
    },
    series: [
      {
        type: 'bar',
        data: data.map((item) => item.amount),
        itemStyle: { color: '#0ea5e9' },
        barMaxWidth: 28
      }
    ]
  }
})

const upcoming30Option = computed(() => {
  const source = overview.value?.upcomingByDay.slice(0, 30).filter((item) => item.count > 0 || item.amount > 0) ?? []
  if (!source.length) return null

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['续订数', '金额'] },
    xAxis: {
      type: 'category',
      data: source.map((item) => dayjs(item.date).format('MM-DD'))
    },
    yAxis: [
      { type: 'value', name: '续订数' },
      { type: 'value', name: `金额(${baseCurrency.value})` }
    ],
    series: [
      {
        name: '续订数',
        type: 'bar',
        data: source.map((item) => item.count),
        itemStyle: { color: '#8b5cf6' },
        barMaxWidth: 18
      },
      {
        name: '金额',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: source.map((item) => item.amount),
        itemStyle: { color: '#ef4444' },
        lineStyle: { color: '#ef4444' }
      }
    ]
  }
})

const topSubscriptionsOption = computed(() =>
  buildTopSubscriptionsOption(overview.value?.topSubscriptionsByMonthlyCost, baseCurrency.value)
)

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}
</script>
