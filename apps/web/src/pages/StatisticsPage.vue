<template>
  <div>
    <page-header
      :title="t('statistics.page.title')"
      :subtitle="t('statistics.page.subtitle')"
      :icon="barChartOutline"
      icon-background="linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)"
    />

    <n-grid v-if="showAiSummaryCard" :cols="1" :x-gap="12" :y-gap="12">
      <n-grid-item>
        <n-card :title="t('statistics.ai.title')">
          <template #header-extra>
            <div class="ai-summary-header-actions">
              <span v-if="dashboardAiSummary?.generatedAt" class="card-muted ai-summary-generated-at">
                {{ t('statistics.ai.generatedAtPrefix') }}{{ summaryGeneratedAtText(dashboardAiSummary.generatedAt) }}
              </span>
              <n-button
                quaternary
                size="small"
                class="ai-summary-toggle"
                @click="summaryExpanded = !summaryExpanded"
              >
                {{ summaryExpanded ? t('statistics.ai.collapseDetails') : t('statistics.ai.viewDetails') }}
              </n-button>
              <n-button size="small" :loading="generatingSummary" :disabled="generatingSummary" @click="regenerateSummary">
                {{ t('statistics.ai.regenerate') }}
              </n-button>
            </div>
          </template>

          <n-space vertical :size="12" style="width: 100%">
            <div v-if="summaryExpanded" class="card-muted">{{ t('statistics.ai.expandedHint') }}</div>

            <div v-if="summaryLoadingVisible" class="ai-summary-loading">
              <n-spin size="small" />
              <div class="card-muted">{{ t('statistics.ai.generatingHint') }}</div>
            </div>

            <template v-else-if="dashboardAiSummary">
              <n-alert
                v-if="dashboardAiSummary.status === 'unconfigured'"
                type="warning"
                :show-icon="false"
              >
                {{ t('statistics.ai.unconfiguredHint') }}
              </n-alert>

              <n-alert
                v-else-if="dashboardAiSummary.status === 'failed'"
                type="error"
                :show-icon="false"
              >
                {{ dashboardAiSummary.errorMessage || t('statistics.ai.failedFallback') }}
              </n-alert>

              <n-empty
                v-else-if="!dashboardAiSummary.content"
                :description="t('statistics.ai.noSummary')"
              />

              <template v-else>
                <div v-if="!summaryExpanded" class="ai-summary-preview">
                  <div class="ai-summary-preview__label">{{ t('statistics.ai.previewLabel') }}</div>
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
              :description="t('statistics.ai.noSummary')"
            />
          </n-space>
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card :title="t('statistics.sections.monthlyTrend')">
          <chart-view v-if="trendOption" :option="trendOption" />
          <n-empty v-else :description="t('statistics.empty.noData')" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card :title="t('statistics.sections.tagSpend')">
          <chart-view v-if="tagSpendOption" :option="tagSpendOption" />
          <n-empty v-else :description="t('statistics.empty.noData')" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card :title="t('statistics.sections.statusDistribution')">
          <chart-view v-if="statusOption" :option="statusOption" />
          <n-empty v-else :description="t('statistics.empty.noData')" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card :title="t('statistics.sections.autoRenewShare')">
          <chart-view v-if="renewalModeOption" :option="renewalModeOption" />
          <n-empty v-else :description="t('statistics.empty.noData')" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card :title="t('statistics.sections.currencyDistribution')">
          <chart-view v-if="currencyOption" :option="currencyOption" />
          <n-empty v-else :description="t('statistics.empty.noData')" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card :title="t('statistics.sections.upcoming30')">
          <chart-view v-if="upcoming30Option" :option="upcoming30Option" />
          <n-empty v-else :description="t('statistics.empty.noUpcoming30')" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-grid :cols="1" :x-gap="12" :y-gap="12" style="margin-top: 12px">
      <n-grid-item>
        <n-card :title="t('statistics.sections.top10')">
          <chart-view v-if="topSubscriptionsOption" :option="topSubscriptionsOption" />
          <n-empty v-else :description="t('statistics.empty.noData')" />
        </n-card>
      </n-grid-item>
    </n-grid>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import { NAlert, NButton, NCard, NCollapseTransition, NEmpty, NGrid, NGridItem, NSpace, NSpin, useThemeVars } from 'naive-ui'
import { BarChartOutline } from '@vicons/ionicons5'
import { t } from '@/locales'
import { api } from '@/composables/api'
import { DASHBOARD_AI_SUMMARY_QUERY_KEY, useDashboardAiSummaryQuery } from '@/composables/dashboard-ai-summary-query'
import { useSettingsQuery } from '@/composables/settings-query'
import { useStatisticsOverviewQuery } from '@/composables/statistics-overview-query'
import ChartView from '@/components/ChartView.vue'
import PageHeader from '@/components/PageHeader.vue'
import { formatAiSummaryPreviewText } from '@subtracker/shared'
import type { StatisticsOverview, SubscriptionStatus } from '@/types/api'
import { renderMarkdownToHtml } from '@/utils/simple-markdown'
import { formatDateInTimezone } from '@/utils/timezone'
import { formatDateTimeInTimezone } from '@/utils/timezone'
import { buildTopSubscriptionsOption } from '@/utils/statistics-top-subscriptions'
import { useLocalizedMessage } from '@/utils/localized-message'

const { width } = useWindowSize()
const barChartOutline = BarChartOutline
const themeVars = useThemeVars()
const queryClient = useQueryClient()
const message = useLocalizedMessage()

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
  active: t('statistics.status.active'),
  paused: t('statistics.status.paused'),
  cancelled: t('statistics.status.cancelled'),
  expired: t('statistics.status.expired')
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
    tooltip: {
      trigger: 'axis',
      backgroundColor: themeVars.value.cardColor,
      borderColor: themeVars.value.borderColor,
      textStyle: { color: themeVars.value.textColor2 }
    },
    legend: { data: [t('statistics.series.trend')], textStyle: { color: themeVars.value.textColor2 } },
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
        name: t('statistics.series.trend'),
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

const renewalModeOption = computed(() => {
  const data = overview.value?.renewalModeDistribution.filter((item) => item.count > 0) ?? []
  if (!data.length) return null

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: { data: { count: number; amount: number; name: string } }) =>
        `${params.data.name}<br/>${t('statistics.labels.renewalCountTooltip')}：${params.data.count}<br/>${t('statistics.labels.amountTooltip')}：${formatMoney(params.data.amount, baseCurrency.value)}`
    },
    legend: { bottom: 0, textStyle: { color: themeVars.value.textColor2 } },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        data: data.map((item) => ({
          name: item.autoRenew ? t('statistics.labels.autoRenew') : t('statistics.labels.manualRenew'),
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

const upcoming30Option = computed(() => {
  const source = overview.value?.upcomingByDay.slice(0, 30).filter((item) => item.count > 0 || item.amount > 0) ?? []
  if (!source.length) return null

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: themeVars.value.cardColor,
      borderColor: themeVars.value.borderColor,
      textStyle: { color: themeVars.value.textColor2 }
    },
    legend: { data: [t('statistics.series.renewalCount'), t('statistics.series.amount')], textStyle: { color: themeVars.value.textColor2 } },
    xAxis: {
      type: 'category',
      data: source.map((item) => formatDateInTimezone(item.date, settings.value?.timezone).slice(5)),
      axisLabel: { color: themeVars.value.textColor3 },
      axisLine: { lineStyle: { color: themeVars.value.borderColor } }
    },
    yAxis: [
      {
        type: 'value',
        name: t('statistics.labels.renewalsCountAxis'),
        nameTextStyle: { color: themeVars.value.textColor3 },
        axisLabel: { color: themeVars.value.textColor3 },
        splitLine: { lineStyle: { color: themeVars.value.dividerColor } }
      },
      {
        type: 'value',
        name: `${t('statistics.series.amount')}(${baseCurrency.value})`,
        nameTextStyle: { color: themeVars.value.textColor3 },
        axisLabel: { color: themeVars.value.textColor3 }
      }
    ],
    series: [
      {
        name: t('statistics.series.renewalCount'),
        type: 'bar',
        data: source.map((item) => item.count),
        itemStyle: { color: '#8b5cf6' },
        barMaxWidth: 18
      },
      {
        name: t('statistics.series.amount'),
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

async function regenerateSummary() {
  if (!showAiSummaryCard.value || generatingSummary.value) return
  generatingSummary.value = true
  try {
    await api.generateDashboardAiSummary()
    await queryClient.invalidateQueries({ queryKey: DASHBOARD_AI_SUMMARY_QUERY_KEY })
    message.success(t('statistics.ai.updated'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('statistics.ai.failed'))
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

.ai-summary-markdown :deep(code) {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--app-surface-alt);
  font-size: 12px;
}
</style>
