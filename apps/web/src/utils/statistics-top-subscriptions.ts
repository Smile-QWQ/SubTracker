import type { StatisticsOverview } from '@/types/api'

interface TopSubscriptionsThemeTokens {
  textColor?: string
  secondaryTextColor?: string
  borderColor?: string
  dividerColor?: string
  tooltipBackgroundColor?: string
}

export function buildTopSubscriptionsOption(
  items: StatisticsOverview['topSubscriptionsByMonthlyCost'] | undefined,
  baseCurrency: string,
  theme?: TopSubscriptionsThemeTokens
) {
  const data = (items ?? []).slice(0, 10)
  if (!data.length) return null

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: theme?.tooltipBackgroundColor,
      borderColor: theme?.borderColor,
      textStyle: {
        color: theme?.textColor
      }
    },
    grid: { left: 160, right: 24, top: 20, bottom: 20 },
    xAxis: {
      type: 'value',
      name: `金额(${baseCurrency})`,
      nameTextStyle: {
        color: theme?.secondaryTextColor
      },
      axisLine: {
        lineStyle: {
          color: theme?.dividerColor
        }
      },
      axisLabel: {
        color: theme?.secondaryTextColor
      },
      splitLine: {
        lineStyle: {
          color: theme?.borderColor
        }
      }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((item) => item.name),
      axisLine: {
        lineStyle: {
          color: theme?.dividerColor
        }
      },
      axisLabel: {
        color: theme?.textColor
      }
    },
    series: [
      {
        type: 'bar',
        data: data.map((item) => item.monthlyAmountBase),
        itemStyle: { color: '#14b8a6' },
        barMaxWidth: 24
      }
    ]
  }
}
