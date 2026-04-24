<template>
  <div>
    <page-header title="仪表盘" subtitle="总览订阅规模、预算使用、待续订与支出分布" :icon="gridOutline" />

    <n-grid :cols="24" :x-gap="12" :y-gap="12">
      <n-grid-item v-for="item in summaryCards" :key="item.label" :span="summarySpan">
        <stat-card :label="item.label" :value="item.value" :icon="item.icon" />
      </n-grid-item>

      <n-grid-item :span="halfSpan">
        <n-card title="月预算使用">
          <template v-if="overview?.budgetSummary.monthly.budget">
            <div class="budget-progress-row">
              <n-progress
                type="line"
                :percentage="formatBudgetPercentage(overview.budgetSummary.monthly.ratio)"
                :status="budgetProgressStatus(overview.budgetSummary.monthly.status)"
                :show-indicator="false"
              />
              <span class="budget-progress-value" :class="progressValueClass(overview.budgetSummary.monthly.status)">
                {{ formatBudgetPercentage(overview.budgetSummary.monthly.ratio) }}%
              </span>
            </div>
            <div class="budget-meta">
              已使用
              <span :class="usedValueClass(overview.budgetSummary.monthly.status)">
                {{ formatMoney(overview.budgetSummary.monthly.spent, baseCurrency) }}
              </span>
              / 预算 {{ formatMoney(overview.budgetSummary.monthly.budget ?? 0, baseCurrency) }}
            </div>
          </template>
          <n-empty v-else description="未设置月预算" />
        </n-card>
      </n-grid-item>

      <n-grid-item :span="halfSpan">
        <n-card title="年预算使用">
          <template v-if="overview?.budgetSummary.yearly.budget">
            <div class="budget-progress-row">
              <n-progress
                type="line"
                :percentage="formatBudgetPercentage(overview.budgetSummary.yearly.ratio)"
                :status="budgetProgressStatus(overview.budgetSummary.yearly.status)"
                :show-indicator="false"
              />
              <span class="budget-progress-value" :class="progressValueClass(overview.budgetSummary.yearly.status)">
                {{ formatBudgetPercentage(overview.budgetSummary.yearly.ratio) }}%
              </span>
            </div>
            <div class="budget-meta">
              已使用
              <span :class="usedValueClass(overview.budgetSummary.yearly.status)">
                {{ formatMoney(overview.budgetSummary.yearly.spent, baseCurrency) }}
              </span>
              / 预算 {{ formatMoney(overview.budgetSummary.yearly.budget ?? 0, baseCurrency) }}
            </div>
          </template>
          <n-empty v-else description="未设置年预算" />
        </n-card>
      </n-grid-item>

      <n-grid-item v-if="showTagBudgetSummary" :span="24">
        <n-card title="标签预算概况">
          <template v-if="overview?.tagBudgetSummary?.configuredCount">
            <div class="tag-budget-summary">
              <div class="tag-budget-summary__stats">
                <div class="tag-budget-summary__stat">
                  <span class="tag-budget-summary__label">已配置标签预算</span>
                  <strong>{{ overview.tagBudgetSummary.configuredCount }}</strong>
                </div>
                <div class="tag-budget-summary__stat">
                  <span class="tag-budget-summary__label">接近预算</span>
                  <strong class="text-warning">{{ overview.tagBudgetSummary.warningCount }}</strong>
                </div>
                <div class="tag-budget-summary__stat">
                  <span class="tag-budget-summary__label">超标</span>
                  <strong class="text-danger">{{ overview.tagBudgetSummary.overBudgetCount }}</strong>
                </div>
              </div>
              <div class="tag-budget-summary__top">
                <div class="tag-budget-summary__title">使用率最高</div>
                <div class="tag-budget-summary__items">
                  <div v-for="tag in overview.tagBudgetSummary.topTags" :key="tag.tagId" class="tag-budget-summary__item">
                    <span class="tag-budget-summary__name">{{ tag.name }}</span>
                    <span :class="progressValueClass(tag.status)">{{ formatBudgetPercentage(tag.ratio) }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <n-empty v-else description="尚未配置标签预算" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="chartCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card title="标签月度支出">
          <chart-view v-if="tagSpendOption" :option="tagSpendOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card title="月支付趋势（未来12个月）">
          <chart-view v-if="trendOption" :option="trendOption" />
          <n-empty v-else description="暂无数据" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-card title="即将续订（30天）" style="margin-top: 12px">
      <n-data-table :columns="columns" :data="overview?.upcomingRenewals ?? []" :pagination="false" />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, h } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NCard, NDataTable, NEmpty, NGrid, NGridItem, NProgress, NTag, useThemeVars } from 'naive-ui'
import { CashOutline, GridOutline, LayersOutline, NotificationsOutline, WalletOutline } from '@vicons/ionicons5'
import { useSettingsQuery } from '@/composables/settings-query'
import { useStatisticsOverviewQuery } from '@/composables/statistics-overview-query'
import ChartView from '@/components/ChartView.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import type { StatisticsOverview } from '@/types/api'
import { getSubscriptionStatusTagType, getSubscriptionStatusText } from '@/utils/subscription-status'

const { width } = useWindowSize()
const gridOutline = GridOutline
const themeVars = useThemeVars()

const { data: overview } = useStatisticsOverviewQuery()

const { data: settings } = useSettingsQuery()

const baseCurrency = computed(() => settings.value?.baseCurrency ?? 'CNY')
const showTagBudgetSummary = computed(() => settings.value?.enableTagBudgets ?? false)
const summarySpan = computed(() => {
  if (width.value < 640) return 24
  if (width.value < 1100) return 12
  return 6
})
const halfSpan = computed(() => (width.value < 1100 ? 24 : 12))
const chartCols = computed(() => (width.value < 1100 ? 1 : 2))

const summaryCards = computed(() => [
  { label: '活跃订阅', value: overview.value?.activeSubscriptions ?? 0, icon: LayersOutline },
  { label: '7 天内续订', value: overview.value?.upcoming7Days ?? 0, icon: NotificationsOutline },
  {
    label: '本月预计支出',
    value: overview.value ? formatMoney(overview.value.monthlyEstimatedBase, baseCurrency.value) : '--',
    icon: WalletOutline
  },
  {
    label: '年度预计支出',
    value: overview.value ? formatMoney(overview.value.yearlyEstimatedBase, baseCurrency.value) : '--',
    icon: CashOutline
  }
])

const tagSpendOption = computed(() => {
  if (!overview.value?.tagSpend?.length) return null
  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: themeVars.value.cardColor,
      borderColor: themeVars.value.borderColor,
      textStyle: { color: themeVars.value.textColor2 }
    },
    legend: { bottom: 0, textStyle: { color: themeVars.value.textColor2 } },
    series: [
      {
        type: 'pie',
        radius: ['40%', '68%'],
        data: overview.value.tagSpend
      }
    ]
  }
})

const trendOption = computed(() => {
  if (!overview.value?.monthlyTrend?.length) return null
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: themeVars.value.cardColor,
      borderColor: themeVars.value.borderColor,
      textStyle: { color: themeVars.value.textColor2 }
    },
    xAxis: {
      type: 'category',
      data: overview.value.monthlyTrend.map((item) => item.month),
      axisLabel: { color: themeVars.value.textColor3 },
      axisLine: { lineStyle: { color: themeVars.value.borderColor } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: themeVars.value.textColor3 },
      splitLine: { lineStyle: { color: themeVars.value.dividerColor } }
    },
    series: [
      {
        data: overview.value.monthlyTrend.map((item) => item.amount),
        type: 'line',
        smooth: true,
        areaStyle: {}
      }
    ]
  }
})

const columns = [
  { title: '订阅', key: 'name' },
  {
    title: '下次续订',
    key: 'nextRenewalDate',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => dayjs(row.nextRenewalDate).format('YYYY-MM-DD')
  },
  {
    title: '原始金额',
    key: 'amount',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => formatMoney(row.amount, row.currency)
  },
  {
    title: '折算金额',
    key: 'convertedAmount',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) => formatMoney(row.convertedAmount, baseCurrency.value)
  },
  {
    title: '状态',
    key: 'status',
    render: (row: StatisticsOverview['upcomingRenewals'][number]) =>
      h(NTag, { type: getSubscriptionStatusTagType(row.status) }, { default: () => getSubscriptionStatusText(row.status) })
  }
]

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

function formatBudgetPercentage(ratio?: number | null) {
  const raw = (ratio ?? 0) * 100
  return Math.round(raw * 100) / 100
}

function budgetProgressStatus(status?: 'normal' | 'warning' | 'over') {
  if (status === 'over') return 'error'
  if (status === 'warning') return 'warning'
  return 'success'
}

function progressValueClass(status?: 'normal' | 'warning' | 'over') {
  return {
    'text-danger': status === 'over',
    'text-warning': status === 'warning'
  }
}

function usedValueClass(status?: 'normal' | 'warning' | 'over') {
  return {
    'budget-meta__used--over': status === 'over',
    'budget-meta__used--warning': status === 'warning'
  }
}
</script>

<style scoped>
.budget-progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.budget-progress-row :deep(.n-progress) {
  flex: 1;
}

.budget-progress-value {
  flex-shrink: 0;
  min-width: 56px;
  text-align: right;
  color: var(--app-text-primary);
  font-variant-numeric: tabular-nums;
}

.budget-meta {
  margin-top: 10px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.budget-meta__used--over {
  color: #dc2626;
  font-weight: 600;
}

.budget-meta__used--warning {
  color: #d97706;
  font-weight: 600;
}

.tag-budget-summary {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.tag-budget-summary__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: 12px;
  flex: 1 1 320px;
}

.tag-budget-summary__stat {
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--app-surface-alt);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-budget-summary__label {
  color: var(--app-text-secondary);
}

.tag-budget-summary__top {
  flex: 1 1 260px;
}

.tag-budget-summary__title {
  margin-bottom: 10px;
  font-weight: 600;
  color: var(--app-text-strong);
}

.tag-budget-summary__items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tag-budget-summary__item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--app-surface-alt);
}

.tag-budget-summary__name {
  font-weight: 600;
  color: var(--app-text-strong);
}

.text-danger {
  color: #dc2626;
  font-weight: 600;
}

.text-warning {
  color: #d97706;
  font-weight: 600;
}

@media (max-width: 760px) {
  .tag-budget-summary__stats {
    grid-template-columns: 1fr;
  }
}
</style>
