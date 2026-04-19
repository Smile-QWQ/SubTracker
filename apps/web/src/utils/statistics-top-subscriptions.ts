import type { StatisticsOverview } from '@/types/api'

export function buildTopSubscriptionsOption(
  items: StatisticsOverview['topSubscriptionsByMonthlyCost'] | undefined,
  baseCurrency: string
) {
  const data = (items ?? []).slice(0, 10)
  if (!data.length) return null

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: { left: 160, right: 24, top: 20, bottom: 20 },
    xAxis: {
      type: 'value',
      name: `金额(${baseCurrency})`
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((item) => item.name)
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
