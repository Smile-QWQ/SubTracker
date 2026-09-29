import { t } from '@/locales'

type SpendEntry = { name: string; value: number }
type ChartTheme = { cardColor: string; borderColor: string; textColor2: string }

export function buildTagSpendOption(
  monthly: SpendEntry[] | undefined,
  yearly: SpendEntry[] | undefined,
  currency: string,
  theme: ChartTheme
) {
  if (!monthly?.length) return null
  const annualByName = new Map(yearly?.map((item) => [item.name, item.value]))
  const total = monthly.reduce((sum, item) => sum + item.value, 0)

  return {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove|click',
      renderMode: 'html',
      confine: true,
      backgroundColor: theme.cardColor,
      borderColor: theme.borderColor,
      textStyle: { color: theme.textColor2 },
      formatter: (params: { dataIndex: number }) => {
        const item = monthly[params.dataIndex]
        const container = document.createElement('div')
        if (!item) return container
        container.style.cssText = 'max-width: 240px; white-space: normal; overflow-wrap: anywhere'
        // Use textContent so user-provided tag names cannot become tooltip markup.
        const title = document.createElement('strong')
        title.textContent = item.name
        container.append(title)
        const rows = [
          `${t('dashboard.tagSpend.monthly')}: ${currency} ${item.value.toFixed(2)}`,
          `${t('dashboard.tagSpend.yearly')}: ${currency} ${(annualByName.get(item.name) ?? item.value * 12).toFixed(2)}`,
          `${t('dashboard.tagSpend.share')}: ${(total > 0 ? item.value / total * 100 : 0).toFixed(2)}%`
        ]
        for (const text of rows) {
          const row = document.createElement('div')
          row.textContent = text
          container.append(row)
        }
        return container
      }
    },
    legend: { bottom: 0, textStyle: { color: theme.textColor2 } },
    series: [{ type: 'pie', radius: ['40%', '68%'], data: monthly }]
  }
}
