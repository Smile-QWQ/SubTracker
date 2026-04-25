<template>
  <div>
    <page-header
      title="订阅日历"
      subtitle="查看订阅日期分布，支持月视图和列表视图"
      :icon="calendarOutline"
      icon-background="linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)"
    />

    <n-grid :cols="summaryCols" :x-gap="12" :y-gap="12" style="margin-bottom: 12px">
      <n-grid-item>
        <stat-card label="当前月份" :value="panelMonthLabel" suffix="当前正在查看的月份" :icon="calendarClearOutline" />
      </n-grid-item>
      <n-grid-item>
        <stat-card label="本月应续订数量" :value="monthEventCount" suffix="当前月份内的订阅数" :icon="notificationsOutline" />
      </n-grid-item>
      <n-grid-item>
        <stat-card
          label="本月预计需支出"
          :value="`${baseCurrency} ${monthConvertedAmount.toFixed(2)}`"
          suffix="已按汇率折算"
          :icon="walletOutline"
        />
      </n-grid-item>
      <n-grid-item>
        <stat-card
          label="选中日期订阅数"
          :value="selectedDateEvents.length"
          :suffix="`${selectedDateLabel} · ${baseCurrency} ${selectedDateConvertedAmount.toFixed(2)}`"
          :icon="todayOutline"
        />
      </n-grid-item>
    </n-grid>

    <n-card class="calendar-panel-card">
      <n-tabs v-model:value="tab">
        <n-tab-pane name="month" tab="月视图">
          <n-grid :cols="calendarCols" :x-gap="12" :y-gap="12">
            <n-grid-item>
              <div class="calendar-wrapper">
                <n-calendar v-model:value="selectedDateTs" @panel-change="handlePanelChange">
                  <template #default="{ year, month, date }">
                    <div v-if="getDaySummary(year, month, date)" class="calendar-cell-summary">
                      <div class="calendar-cell-summary__count">{{ getDaySummary(year, month, date)?.count }} 笔</div>
                      <div class="calendar-cell-summary__amount">
                        {{ baseCurrency }} {{ getDaySummary(year, month, date)?.convertedAmount.toFixed(0) }}
                      </div>
                    </div>
                  </template>
                </n-calendar>
              </div>
            </n-grid-item>

            <n-grid-item>
              <n-card :title="`当天续订（${selectedDateLabel}）`" size="small" class="day-detail-card">
                <template #header-extra>
                  <span class="day-summary-inline">
                    共 {{ selectedDateEvents.length }} 笔 · {{ baseCurrency }} {{ selectedDateConvertedAmount.toFixed(2) }}
                  </span>
                </template>

                <n-empty v-if="selectedDateEvents.length === 0" description="当天无续订" />

                <n-space v-else vertical :size="10">
                  <div v-for="item in selectedDateEvents" :key="item.id" class="day-event-item">
                    <div class="day-event-item__title-row">
                      <span class="day-event-item__title">{{ item.title }}</span>
                      <n-tag size="small" :type="getSubscriptionStatusTagType(item.status)">
                        {{ getSubscriptionStatusText(item.status) }}
                      </n-tag>
                    </div>

                    <div class="day-event-item__meta">
                      {{ item.currency }} {{ item.amount.toFixed(2) }} / 折算 {{ baseCurrency }}
                      {{ item.convertedAmount.toFixed(2) }}
                    </div>
                  </div>
                </n-space>
              </n-card>
            </n-grid-item>
          </n-grid>
        </n-tab-pane>

        <n-tab-pane name="list" tab="列表视图">
          <n-data-table :columns="columns" :data="events" :pagination="{ pageSize: 12 }" />
        </n-tab-pane>
      </n-tabs>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NCalendar, NCard, NDataTable, NEmpty, NGrid, NGridItem, NSpace, NTabPane, NTabs, NTag } from 'naive-ui'
import {
  CalendarClearOutline,
  CalendarOutline,
  NotificationsOutline,
  TodayOutline,
  WalletOutline
} from '@vicons/ionicons5'
import { useCalendarEventsQuery } from '@/composables/calendar-events-query'
import { useSettingsQuery } from '@/composables/settings-query'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import type { CalendarEvent } from '@/types/api'
import { getSubscriptionStatusTagType, getSubscriptionStatusText } from '@/utils/subscription-status'
import {
  businessDateToPickerTs,
  currentBusinessDatePickerTs,
  daysInMonthFromMonthKey,
  formatDateInTimezone,
  formatMonthLabelInTimezone,
  monthKeyToPickerTs,
  monthRangeFromMonthKey,
  pickerTsToDateString,
  pickerTsToMonthKey
} from '@/utils/timezone'

const { width } = useWindowSize()
const calendarOutline = CalendarOutline
const calendarClearOutline = CalendarClearOutline
const notificationsOutline = NotificationsOutline
const walletOutline = WalletOutline
const todayOutline = TodayOutline

const events = ref<CalendarEvent[]>([])
const tab = ref('month')
const { data: settings } = useSettingsQuery()
const selectedDateTs = ref(currentBusinessDatePickerTs(settings.value?.timezone))
const panelMonthKey = ref(pickerTsToMonthKey(selectedDateTs.value))
let ignoreSelectedDateWatch = false
const baseCurrency = computed(() => settings.value?.baseCurrency ?? 'CNY')
const panelMonthRange = computed(() => {
  return monthRangeFromMonthKey(panelMonthKey.value)
})
const calendarEventsQuery = useCalendarEventsQuery(panelMonthRange)

const summaryCols = computed(() => (width.value < 640 ? 1 : width.value < 1100 ? 2 : 4))
const calendarCols = computed(() => (width.value < 1100 ? 1 : 2))

onMounted(async () => {
  if (width.value < 720) {
    tab.value = 'list'
  }
})

watch(selectedDateTs, async (value) => {
  if (ignoreSelectedDateWatch) {
    ignoreSelectedDateWatch = false
    return
  }

  const selectedMonthKey = pickerTsToMonthKey(value)
  if (selectedMonthKey !== panelMonthKey.value) {
    panelMonthKey.value = selectedMonthKey
  }
})

watch(
  () => calendarEventsQuery.data.value,
  (value) => {
    events.value = value ?? []
  },
  { immediate: true }
)

watch(
  () => settings.value?.timezone,
  (timezone) => {
    if (!timezone) return
    const currentDateString = pickerTsToDateString(selectedDateTs.value)
    selectedDateTs.value = businessDateToPickerTs(currentDateString, timezone)
    panelMonthKey.value = pickerTsToMonthKey(selectedDateTs.value)
  }
)

const panelMonthLabel = computed(() => formatMonthLabelInTimezone(`${panelMonthKey.value}-01`, settings.value?.timezone))
const selectedDateLabel = computed(() => pickerTsToDateString(selectedDateTs.value))

const eventMap = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events.value) {
    const key = formatDateInTimezone(event.date, settings.value?.timezone)
    const list = map.get(key) ?? []
    list.push(event)
    map.set(key, list)
  }
  return map
})

const selectedDateEvents = computed(() =>
  events.value.filter((item) => formatDateInTimezone(item.date, settings.value?.timezone) === selectedDateLabel.value)
)
const selectedDateConvertedAmount = computed(() => selectedDateEvents.value.reduce((sum, item) => sum + item.convertedAmount, 0))
const monthEventCount = computed(() => events.value.length)
const monthConvertedAmount = computed(() => events.value.reduce((sum, item) => sum + item.convertedAmount, 0))

const columns = [
  { title: '订阅', key: 'title' },
  {
    title: '日期',
    key: 'date',
    render: (row: CalendarEvent) => formatDateInTimezone(row.date, settings.value?.timezone)
  },
  {
    title: '原始金额',
    key: 'amount',
    render: (row: CalendarEvent) => `${row.currency} ${row.amount.toFixed(2)}`
  },
  {
    title: '折算金额',
    key: 'convertedAmount',
    render: (row: CalendarEvent) => `${baseCurrency.value} ${row.convertedAmount.toFixed(2)}`
  },
  {
    title: '状态',
    key: 'status',
    render: (row: CalendarEvent) => getSubscriptionStatusText(row.status)
  }
]

function handlePanelChange({ year, month }: { year: number; month: number }) {
  const targetMonthKey = `${year}-${String(month).padStart(2, '0')}`
  const currentSelectedDay = Number(selectedDateLabel.value.slice(8, 10))
  const clampedDay = Math.min(currentSelectedDay, daysInMonthFromMonthKey(targetMonthKey))
  const targetSelectedDate = `${targetMonthKey}-${String(clampedDay).padStart(2, '0')}`

  ignoreSelectedDateWatch = true
  selectedDateTs.value = businessDateToPickerTs(targetSelectedDate, settings.value?.timezone)
  panelMonthKey.value = targetMonthKey
}

function getDaySummary(year: number, month: number, date: number) {
  const key = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
  const items = eventMap.value.get(key)
  if (!items?.length) return null

  return {
    count: items.length,
    convertedAmount: items.reduce((sum, item) => sum + item.convertedAmount, 0)
  }
}
</script>

<style scoped>
.calendar-panel-card {
  overflow: hidden;
}

.calendar-wrapper {
  max-width: 720px;
}

.day-detail-card {
  min-height: 180px;
}

.day-event-item {
  padding: 10px 12px;
  border: 1px solid var(--app-border-soft);
  border-radius: 10px;
  background: var(--app-surface);
}

.day-event-item__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.day-event-item__title {
  min-width: 0;
  font-weight: 600;
  color: var(--app-text-strong);
}

.day-event-item__meta {
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.calendar-cell-summary {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  line-height: 1.2;
}

.calendar-cell-summary__count {
  color: var(--app-accent);
  font-weight: 600;
}

.calendar-cell-summary__amount {
  color: var(--app-text-secondary);
}

.day-summary-inline {
  font-size: 12px;
  color: var(--app-text-secondary);
}

:deep(.n-calendar .n-calendar-header) {
  margin-bottom: 8px;
}

:deep(.n-calendar .n-calendar-dates .n-calendar-cell) {
  min-height: 56px;
}

:deep(.n-calendar .n-calendar-dates .n-calendar-cell-value) {
  padding: 3px 5px 2px;
}

@media (max-width: 1100px) {
  .calendar-wrapper {
    max-width: none;
  }
}
</style>
