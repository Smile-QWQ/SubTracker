<template>
  <div>
    <page-header
      title="预算统计"
      subtitle="查看总预算使用情况与标签月预算分析"
      :icon="walletOutline"
      icon-background="linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)"
    />

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12">
      <n-grid-item>
        <n-card title="月预算使用">
          <template v-if="budgetStats?.budgetSummary.monthly.budget">
            <div class="budget-progress-row">
              <n-progress
                type="line"
                :percentage="formatPercentage(budgetStats.budgetSummary.monthly.ratio)"
                :status="progressStatus(budgetStats.budgetSummary.monthly.status)"
                :show-indicator="false"
              />
              <span class="budget-progress-value" :class="progressValueClass(budgetStats.budgetSummary.monthly.status)">
                {{ formatPercentage(budgetStats.budgetSummary.monthly.ratio) }}%
              </span>
            </div>
            <div class="budget-meta">
              已使用
              <span :class="usedValueClass(budgetStats.budgetSummary.monthly.status)">
                {{ formatMoney(budgetStats.budgetSummary.monthly.spent, baseCurrency) }}
              </span>
              / 预算 {{ formatMoney(budgetStats.budgetSummary.monthly.budget ?? 0, baseCurrency) }}
            </div>
          </template>
          <n-empty v-else description="未设置月预算" />
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="年预算使用">
          <template v-if="budgetStats?.budgetSummary.yearly.budget">
            <div class="budget-progress-row">
              <n-progress
                type="line"
                :percentage="formatPercentage(budgetStats.budgetSummary.yearly.ratio)"
                :status="progressStatus(budgetStats.budgetSummary.yearly.status)"
                :show-indicator="false"
              />
              <span class="budget-progress-value" :class="progressValueClass(budgetStats.budgetSummary.yearly.status)">
                {{ formatPercentage(budgetStats.budgetSummary.yearly.ratio) }}%
              </span>
            </div>
            <div class="budget-meta">
              已使用
              <span :class="usedValueClass(budgetStats.budgetSummary.yearly.status)">
                {{ formatMoney(budgetStats.budgetSummary.yearly.spent, baseCurrency) }}
              </span>
              / 预算 {{ formatMoney(budgetStats.budgetSummary.yearly.budget ?? 0, baseCurrency) }}
            </div>
          </template>
          <n-empty v-else description="未设置年预算" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <template v-if="budgetStats?.enabledTagBudgets">
      <n-space justify="space-between" align="center" style="margin-top: 12px; flex-wrap: wrap; gap: 12px">
        <div class="section-hint">
          标签月预算与总预算相互独立，仅对已配置预算的标签生效。
        </div>
        <n-button type="primary" @click="tagBudgetModalVisible = true">设置标签月预算</n-button>
      </n-space>

      <n-grid :cols="summaryCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
        <n-grid-item v-for="card in summaryCards" :key="card.label">
          <n-card size="small">
            <div class="summary-card">
              <div class="summary-card__label">{{ card.label }}</div>
              <div class="summary-card__value" :class="card.className">{{ card.value }}</div>
            </div>
          </n-card>
        </n-grid-item>
      </n-grid>

      <template v-if="hasConfiguredTagBudgets">
        <n-grid :cols="gridCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
          <n-grid-item>
            <n-card title="标签预算使用率">
              <chart-view v-if="tagBudgetOption" :option="tagBudgetOption" />
              <n-empty v-else description="暂无标签预算数据" />
            </n-card>
          </n-grid-item>

          <n-grid-item>
            <n-card title="预算摘要">
              <div class="summary-list">
                <div class="summary-list__item">
                  <span>已配置标签预算</span>
                  <strong>{{ budgetStats.tagBudgetSummary?.configuredCount ?? 0 }}</strong>
                </div>
                <div class="summary-list__item">
                  <span>接近预算</span>
                  <strong class="text-warning">{{ budgetStats.tagBudgetSummary?.warningCount ?? 0 }}</strong>
                </div>
                <div class="summary-list__item">
                  <span>超标</span>
                  <strong class="text-danger">{{ budgetStats.tagBudgetSummary?.overBudgetCount ?? 0 }}</strong>
                </div>
              </div>

              <n-divider />

              <div class="top-tags">
                <div class="top-tags__title">使用率最高 Top 3</div>
                <div v-if="budgetStats.tagBudgetSummary?.topTags.length" class="top-tags__list">
                  <div v-for="tag in budgetStats.tagBudgetSummary.topTags" :key="tag.tagId" class="top-tags__item">
                    <div class="top-tags__name">{{ tag.name }}</div>
                    <div class="top-tags__meta">
                      <span :class="progressValueClass(tag.status)">{{ formatPercentage(tag.ratio) }}%</span>
                      <span>{{ formatMoney(tag.spent, baseCurrency) }} / {{ formatMoney(tag.budget, baseCurrency) }}</span>
                    </div>
                  </div>
                </div>
                <n-empty v-else description="暂无标签预算数据" />
              </div>
            </n-card>
          </n-grid-item>
        </n-grid>

        <n-card title="标签预算使用表" style="margin-top: 12px">
          <n-data-table :columns="columns" :data="budgetStats.tagBudgetUsage" :pagination="false" />
        </n-card>
      </template>

      <n-card v-else title="标签预算" style="margin-top: 12px">
        <n-empty description="尚未配置标签预算" />
      </n-card>
    </template>

    <tag-budget-settings-modal
      :show="tagBudgetModalVisible"
      :tags="tags"
      :budgets="settings?.tagBudgets ?? {}"
      :base-currency="baseCurrency"
      @close="tagBudgetModalVisible = false"
      @save="saveTagBudgets"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useWindowSize } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { NButton, NCard, NDataTable, NDivider, NEmpty, NGrid, NGridItem, NProgress, NSpace, NTag, useMessage } from 'naive-ui'
import { WalletOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import { SETTINGS_QUERY_KEY, useSettingsQuery } from '@/composables/settings-query'
import ChartView from '@/components/ChartView.vue'
import PageHeader from '@/components/PageHeader.vue'
import TagBudgetSettingsModal from '@/components/TagBudgetSettingsModal.vue'
import type { BudgetStatistics, TagBudgetUsage } from '@/types/api'

const walletOutline = WalletOutline
const { width } = useWindowSize()
const router = useRouter()
const message = useMessage()
const queryClient = useQueryClient()
const tagBudgetModalVisible = ref(false)

const { data: budgetStats } = useQuery({
  queryKey: ['statistics-budgets'],
  queryFn: api.getBudgetStatistics
})

const { data: settings } = useSettingsQuery()

const { data: tags } = useQuery({
  queryKey: ['budget-page-tags'],
  queryFn: api.getTags,
  initialData: []
})

watch(
  () => settings.value?.enableTagBudgets,
  (enabled) => {
    if (enabled === false) {
      router.replace('/dashboard')
    }
  },
  { immediate: true }
)

const baseCurrency = computed(() => settings.value?.baseCurrency ?? 'CNY')
const gridCols = computed(() => (width.value < 1100 ? 1 : 2))
const summaryCols = computed(() => (width.value < 900 ? 1 : 3))
const hasConfiguredTagBudgets = computed(() => (budgetStats.value?.tagBudgetSummary?.configuredCount ?? 0) > 0)

const summaryCards = computed(() => {
  const summary = budgetStats.value?.tagBudgetSummary
  return [
    { label: '已配置标签预算', value: summary?.configuredCount ?? 0, className: '' },
    { label: '接近预算', value: summary?.warningCount ?? 0, className: 'text-warning' },
    { label: '超标', value: summary?.overBudgetCount ?? 0, className: 'text-danger' }
  ]
})

const tagBudgetOption = computed(() => {
  const usage = budgetStats.value?.tagBudgetUsage ?? []
  if (!usage.length) return null

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ data: number; axisValue: string }>) => {
        const row = usage.find((item) => item.name === params[0]?.axisValue)
        if (!row) return ''
        return [
          `${row.name}`,
          `使用率：${formatPercentage(row.ratio)}%`,
          `已使用：${formatMoney(row.spent, baseCurrency.value)}`,
          `预算：${formatMoney(row.budget, baseCurrency.value)}`
        ].join('<br/>')
      }
    },
    grid: { left: 80, right: 24, top: 20, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: usage.map((item) => item.name)
    },
    series: [
      {
        type: 'bar',
        data: usage.map((item) => ({
          value: Number((item.ratio * 100).toFixed(2)),
          itemStyle: {
            color: item.status === 'over' ? '#ef4444' : item.status === 'warning' ? '#f59e0b' : '#2563eb'
          }
        })),
        barMaxWidth: 24
      }
    ]
  }
})

const columns = [
  { title: '标签', key: 'name' },
  {
    title: '已使用',
    key: 'spent',
    render: (row: TagBudgetUsage) => formatMoney(row.spent, baseCurrency.value)
  },
  {
    title: '预算',
    key: 'budget',
    render: (row: TagBudgetUsage) => formatMoney(row.budget, baseCurrency.value)
  },
  {
    title: '剩余 / 超出',
    key: 'remaining',
    render: (row: TagBudgetUsage) =>
      row.overBudget > 0
        ? `超出 ${formatMoney(row.overBudget, baseCurrency.value)}`
        : `剩余 ${formatMoney(row.remaining, baseCurrency.value)}`
  },
  {
    title: '使用率',
    key: 'ratio',
    render: (row: TagBudgetUsage) =>
      h(
        'span',
        {
          class: progressValueClass(row.status)
        },
        `${formatPercentage(row.ratio)}%`
      )
  },
  {
    title: '状态',
    key: 'status',
    render: (row: TagBudgetUsage) =>
      h(
        NTag,
        { type: row.status === 'over' ? 'error' : row.status === 'warning' ? 'warning' : 'success' },
        { default: () => (row.status === 'over' ? '超标' : row.status === 'warning' ? '接近预算' : '正常') }
      )
  }
]

async function saveTagBudgets(tagBudgets: Record<string, number>) {
  await api.updateSettings({ tagBudgets })
  tagBudgetModalVisible.value = false
  message.success('标签月预算已保存')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['statistics-budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['statistics-overview'] }),
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY })
    ])
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

function formatPercentage(ratio?: number | null) {
  const raw = (ratio ?? 0) * 100
  return Math.round(raw * 100) / 100
}

function progressStatus(status: BudgetStatistics['budgetSummary']['monthly']['status']) {
  if (status === 'over') return 'error'
  if (status === 'warning') return 'warning'
  return 'success'
}

function progressValueClass(status: BudgetStatistics['budgetSummary']['monthly']['status']) {
  return {
    'text-danger': status === 'over',
    'text-warning': status === 'warning'
  }
}

function usedValueClass(status: BudgetStatistics['budgetSummary']['monthly']['status']) {
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
  min-width: 64px;
  text-align: right;
  color: #334155;
  font-variant-numeric: tabular-nums;
}

.budget-meta {
  margin-top: 10px;
  color: #64748b;
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

.section-hint {
  color: #64748b;
  line-height: 1.6;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-card__label {
  color: #64748b;
}

.summary-card__value {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-list__item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.top-tags__title {
  margin-bottom: 12px;
  font-weight: 600;
  color: #0f172a;
}

.top-tags__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.top-tags__item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.top-tags__name {
  font-weight: 600;
  color: #0f172a;
}

.top-tags__meta {
  display: flex;
  gap: 12px;
  color: #64748b;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.text-danger {
  color: #dc2626;
  font-weight: 600;
}

.text-warning {
  color: #d97706;
  font-weight: 600;
}
</style>
