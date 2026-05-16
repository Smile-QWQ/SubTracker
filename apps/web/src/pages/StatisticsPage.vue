<template>
  <div>
    <page-header title="费用统计" subtitle="用轻量概览、分布和排行快速查看订阅支出" :icon="barChartOutline" icon-background="linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)" />

    <n-grid v-if="showAiSummaryCard" :cols="1" :x-gap="12" :y-gap="12">
      <n-grid-item>
        <n-card title="AI 总结">
          <template #header-extra>
            <div class="ai-summary-header-actions">
              <span v-if="dashboardAiSummary?.generatedAt" class="card-muted ai-summary-generated-at">
                最近生成：{{ summaryGeneratedAtText(dashboardAiSummary.generatedAt) }}
              </span>
              <n-button
                quaternary
                size="small"
                class="ai-summary-toggle"
                @click="summaryExpanded = !summaryExpanded"
              >
                {{ summaryExpanded ? '收起详情' : '查看详情' }}
              </n-button>
              <n-button size="small" :loading="generatingSummary" :disabled="generatingSummary" @click="regenerateSummary">
                重新生成总结
              </n-button>
            </div>
          </template>

          <n-space vertical :size="12" style="width: 100%">
            <div v-if="summaryExpanded" class="card-muted">基于当前统计自动生成，不会修改订阅数据</div>

            <div v-if="summaryLoadingVisible" class="ai-summary-loading">
              <n-spin size="small" />
              <div class="card-muted">正在基于当前统计生成 AI 总结，请稍候…</div>
            </div>

            <template v-else-if="dashboardAiSummary">
              <n-alert
                v-if="dashboardAiSummary.status === 'unconfigured'"
                type="warning"
                :show-icon="false"
              >
                请先前往系统设置启用 AI 能力与 AI 总结，之后统计页面会自动生成总结。
              </n-alert>

              <n-alert
                v-else-if="dashboardAiSummary.status === 'failed'"
                type="error"
                :show-icon="false"
              >
                {{ dashboardAiSummary.errorMessage || 'AI 总结生成失败，请稍后重试。' }}
              </n-alert>

              <n-empty
                v-else-if="!dashboardAiSummary.content"
                description="暂无 AI 总结"
              />

              <template v-else>
                <div v-if="!summaryExpanded" class="ai-summary-preview">
                  <div class="ai-summary-preview__label">摘要</div>
                  <div class="ai-summary-preview__text">{{ dashboardSummaryPreviewText }}</div>
                </div>
                <n-collapse-transition :show="summaryExpanded">
                  <div
                    v-if="summaryExpanded"
                    class="ai-summary-markdown"
                    v-html="dashboardSummaryHtml"
                  />
                </n-collapse-transition>
              </template>
            </template>

            <n-empty
              v-else-if="!dashboardAiSummaryQuery.isLoading.value"
              description="暂无 AI 总结"
            />
          </n-space>
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="1" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card title="费用概览">
          <div class="summary-grid">
            <div class="summary-item">
              <span class="summary-item__label">活跃订阅</span>
              <strong>{{ overview?.activeSubscriptions ?? 0 }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-item__label">7 天内续订</span>
              <strong>{{ overview?.upcoming7Days ?? 0 }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-item__label">30 天内续订</span>
              <strong>{{ overview?.upcoming30Days ?? 0 }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-item__label">本月预计支出</span>
              <strong>{{ overview ? formatMoney(overview.monthlyEstimatedBase, baseCurrency) : '--' }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-item__label">年度预计支出</span>
              <strong>{{ overview ? formatMoney(overview.yearlyEstimatedBase, baseCurrency) : '--' }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-item__label">月预算使用率</span>
              <strong>{{ formatBudgetRatio(overview?.budgetSummary.monthly.ratio) }}</strong>
            </div>
            <div class="summary-item">
              <span class="summary-item__label">年预算使用率</span>
              <strong>{{ formatBudgetRatio(overview?.budgetSummary.yearly.ratio) }}</strong>
            </div>
          </div>
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
        <n-card title="订阅币种分布">
          <chart-view v-if="currencyOption" :option="currencyOption" />
          <n-empty v-else description="暂无数据" />
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
import { computed, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import { NAlert, NButton, NCard, NCollapseTransition, NEmpty, NGrid, NGridItem, NSpace, NSpin, useMessage, useThemeVars } from 'naive-ui'
import { BarChartOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import { DASHBOARD_AI_SUMMARY_QUERY_KEY, useDashboardAiSummaryQuery } from '@/composables/dashboard-ai-summary-query'
import { useSettingsQuery } from '@/composables/settings-query'
import { useStatisticsOverviewQuery } from '@/composables/statistics-overview-query'
import ChartView from '@/components/ChartView.vue'
import PageHeader from '@/components/PageHeader.vue'
import { formatAiSummaryPreviewText } from '@subtracker/shared'
import type { SubscriptionStatus } from '@/types/api'
import { renderMarkdownToHtml } from '@/utils/simple-markdown'
import { formatDateInTimezone, formatDateTimeInTimezone } from '@/utils/timezone'
import { buildTopSubscriptionsOption } from '@/utils/statistics-top-subscriptions'

const { width } = useWindowSize()
const barChartOutline = BarChartOutline
const queryClient = useQueryClient()
const message = useMessage()
const themeVars = useThemeVars()

const { data: overview } = useStatisticsOverviewQuery()
const { data: settings } = useSettingsQuery()

const showAiSummaryCard = computed(() => Boolean(settings.value?.aiConfig.enabled && settings.value?.aiConfig.dashboardSummaryEnabled))
const dashboardAiSummaryQuery = useDashboardAiSummaryQuery(showAiSummaryCard)
const dashboardAiSummary = computed(() => dashboardAiSummaryQuery.data.value)
const generatingSummary = ref(false)
const autoGenerateAttempted = ref(false)
const summaryExpanded = ref(false)

const baseCurrency = computed(() => settings.value?.baseCurrency ?? 'CNY')
const gridCols = computed(() => (width.value < 1100 ? 1 : 2))
const summaryLoadingVisible = computed(
  () =>
    showAiSummaryCard.value && (
      generatingSummary.value ||
      dashboardAiSummary.value?.status === 'generating' ||
      (dashboardAiSummaryQuery.isLoading.value && !dashboardAiSummary.value?.content)
    )
)
const dashboardSummaryHtml = computed(() =>
  dashboardAiSummary.value?.content ? renderMarkdownToHtml(dashboardAiSummary.value.content) : ''
)
const dashboardSummaryPreviewText = computed(() =>
  formatAiSummaryPreviewText(dashboardAiSummary.value?.previewContent || dashboardAiSummary.value?.content || '')
)

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

const statusOption = computed(() => {
  const data = overview.value?.statusDistribution.filter((item) => item.count > 0) ?? []
  if (!data.length) return null

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: themeVars.value.cardColor,
      borderColor: themeVars.value.borderColor,
      textStyle: { color: themeVars.value.textColor2 }
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: themeVars.value.textColor3 },
      splitLine: { lineStyle: { color: themeVars.value.dividerColor } }
    },
    yAxis: {
      type: 'category',
      data: data.map((item) => statusLabelMap[item.status]),
      axisLabel: { color: themeVars.value.textColor3 },
      axisLine: { lineStyle: { color: themeVars.value.borderColor } }
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

const currencyOption = computed(() => {
  const data = overview.value?.currencyDistribution ?? []
  if (!data.length) return null

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: themeVars.value.cardColor,
      borderColor: themeVars.value.borderColor,
      textStyle: { color: themeVars.value.textColor2 }
    },
    grid: { left: 80, right: 24, top: 20, bottom: 20 },
    xAxis: {
      type: 'value',
      axisLabel: { color: themeVars.value.textColor3 },
      splitLine: { lineStyle: { color: themeVars.value.dividerColor } }
    },
    yAxis: {
      type: 'category',
      data: data.map((item) => item.currency),
      axisLabel: { color: themeVars.value.textColor3 },
      axisLine: { lineStyle: { color: themeVars.value.borderColor } }
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

const topSubscriptionsOption = computed(() =>
  buildTopSubscriptionsOption(overview.value?.topSubscriptionsByMonthlyCost, baseCurrency.value, {
    textColor: themeVars.value.textColor2,
    secondaryTextColor: themeVars.value.textColor3,
    borderColor: themeVars.value.borderColor,
    dividerColor: themeVars.value.dividerColor,
    tooltipBackgroundColor: themeVars.value.cardColor
  })
)

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`
}

function formatBudgetRatio(ratio?: number | null) {
  if (ratio === null || ratio === undefined) {
    return '未设置预算'
  }

  return `${(ratio * 100).toFixed(2)}%`
}

async function regenerateSummary() {
  if (!showAiSummaryCard.value || generatingSummary.value) return
  generatingSummary.value = true
  try {
    await api.generateDashboardAiSummary()
    await queryClient.invalidateQueries({ queryKey: DASHBOARD_AI_SUMMARY_QUERY_KEY })
    message.success('AI 总结已更新')
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'AI 总结生成失败')
  } finally {
    generatingSummary.value = false
  }
}

function summaryGeneratedAtText(value: string) {
  return formatDateTimeInTimezone(value, settings.value?.timezone)
}

watch(
  [() => dashboardAiSummaryQuery.isLoading.value, dashboardAiSummary, overview],
  async ([loading, summary, currentOverview]) => {
    if (!showAiSummaryCard.value || loading || generatingSummary.value || autoGenerateAttempted.value || !currentOverview) return
    if (!summary) {
      autoGenerateAttempted.value = true
      await regenerateSummary()
      return
    }
    if (!summary.canGenerate || !summary.needsGeneration) return

    autoGenerateAttempted.value = true
    await regenerateSummary()
  },
  { immediate: true }
)
</script>

<style scoped>
.card-muted {
  color: var(--app-text-secondary);
}

.ai-summary-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ai-summary-generated-at {
  white-space: nowrap;
}

.ai-summary-toggle {
  font-weight: 600;
}

.ai-summary-loading {
  min-height: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.ai-summary-preview {
  max-width: 100%;
}

.ai-summary-preview__label {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.ai-summary-preview__text {
  color: var(--app-text-primary);
  line-height: 1.85;
  word-break: break-word;
  white-space: normal;
}

.ai-summary-markdown {
  color: var(--app-text-primary);
  line-height: 1.75;
  word-break: break-word;
}

.ai-summary-markdown :deep(h2),
.ai-summary-markdown :deep(h3) {
  margin: 0 0 10px;
  color: var(--app-text-strong);
}

.ai-summary-markdown :deep(p) {
  margin: 0 0 10px;
}

.ai-summary-markdown :deep(ul) {
  margin: 0 0 12px;
  padding-left: 20px;
}

.ai-summary-markdown :deep(li) {
  margin-bottom: 6px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.summary-item {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--app-surface-alt);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-item__label {
  color: var(--app-text-secondary);
  font-size: 13px;
}
</style>
