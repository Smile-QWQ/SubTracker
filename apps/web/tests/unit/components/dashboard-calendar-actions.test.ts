import { readFileSync } from 'node:fs'
import { shallowMount } from '@vue/test-utils'
import { NButton, NCalendar } from 'naive-ui'
import { t } from '@/locales'
import UpcomingRenewalActions from '@/components/UpcomingRenewalActions.vue'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ renew: vi.fn(), push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/composables/subscription-renewal', () => ({ useSubscriptionRenewal: () => ({ renewingIds: ref(new Set()), renew: mocks.renew }) }))
vi.mock('@/composables/settings-query', () => ({ useSettingsQuery: () => ({ data: ref({ baseCurrency: 'USD', timezone: 'UTC' }) }) }))
vi.mock('@/composables/statistics-overview-query', () => ({ useStatisticsOverviewQuery: () => ({ data: ref({
  activeSubscriptions: 2, monthlyEstimatedBase: 10, yearlyEstimatedBase: 120, lifetimeTotalBase: 300,
  tagSpend: [{ name: 'Tools', value: 10 }], tagSpendYearly: [{ name: 'Tools', value: 120 }], monthlyTrend: [],
  budgetSummary: { monthly: {}, yearly: {} }, upcomingRenewals: [{ id: 'sub-1', name: 'Tools', amount: 10, convertedAmount: 10, currency: 'USD', status: 'active', nextRenewalDate: '2026-05-01' }]
}) }) }))
vi.mock('@/composables/calendar-events-query', () => ({ useCalendarEventsQuery: (range: { value: { start: string } }) => ({ data: computed(() => [{
  id: 'sub-1:projected-date', subscriptionId: 'sub-1', title: 'Tools', date: range.value.start,
  amount: 10, convertedAmount: 10, currency: 'USD', status: 'active'
}]) }) }))

import DashboardPage from '@/pages/DashboardPage.vue'
import CalendarPage from '@/pages/CalendarPage.vue'

const slots = { template: '<div><slot/><slot name="header-extra"/></div>' }
const global = { stubs: { Grid: slots, GridItem: slots, Card: slots, Tabs: slots, TabPane: slots, Space: slots } }

describe('dashboard and calendar actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('switches tag chart between monthly and yearly amounts and displays lifetime investment', async () => {
    const wrapper = shallowMount(DashboardPage, { global })
    const chart = wrapper.findComponent({ name: 'ChartView' })
    expect(chart.props('option').series[0].data).toEqual([{ name: 'Tools', value: 10 }])
    wrapper.findComponent({ name: 'RadioGroup' }).vm.$emit('update:value', 'yearly')
    await wrapper.vm.$nextTick()
    expect(chart.props('option').series[0].data).toEqual([{ name: 'Tools', value: 120 }])
    expect(wrapper.findAllComponents({ name: 'StatCard' }).map((item) => item.props('value'))).toContain('USD 300.00')
    wrapper.unmount()
  })

  it('renews the dashboard subscription from its table action', () => {
    const wrapper = shallowMount(DashboardPage, { global })
    const table = wrapper.findComponent({ name: 'DataTable' })
    const action = table.props('columns').find((column: { key: string }) => column.key === 'actions')
    const actions = action.render(table.props('data')[0])
    expect(actions.type).toBe(UpcomingRenewalActions)
    expect(actions.props.subscriptionId).toBe('sub-1')
    actions.props.onRenew(actions.props.subscriptionId, actions.props.name)
    expect(mocks.renew).toHaveBeenCalledWith('sub-1', 'Tools')
    wrapper.unmount()
  })

  it('uses subscriptionId, not the projected event id, for calendar renewal', () => {
    const wrapper = shallowMount(CalendarPage, { global })
    const table = wrapper.findComponent({ name: 'DataTable' })
    const action = table.props('columns').find((column: { key: string }) => column.key === 'actions')
    const actions = action.render(table.props('data')[0])
    expect(actions.type).toBe(UpcomingRenewalActions)
    expect(actions.props.subscriptionId).toBe('sub-1')
    actions.props.onRenew(actions.props.subscriptionId, actions.props.name)
    expect(mocks.renew).toHaveBeenCalledWith('sub-1', 'Tools')
    wrapper.unmount()
  })

  it('offers the same actions in the calendar day details', async () => {
    const wrapper = shallowMount(CalendarPage, { global })
    const event = wrapper.findComponent({ name: 'DataTable' }).props('data')[0]
    wrapper.findComponent(NCalendar).vm.$emit('update:value', new Date(event.date).getTime())
    await wrapper.vm.$nextTick()
    const actions = wrapper.findComponent(UpcomingRenewalActions)
    expect(actions.props('subscriptionId')).toBe('sub-1')
    actions.vm.$emit('renew', 'sub-1', 'Tools')
    expect(mocks.renew).toHaveBeenCalledWith('sub-1', 'Tools')
    wrapper.unmount()
  })

  it('reuses the management ghost renewal style and navigates by subscription id', async () => {
    const wrapper = shallowMount(UpcomingRenewalActions, {
      props: { subscriptionId: 'sub-1', name: 'Tools' },
      global: { renderStubDefaultSlot: true, stubs: { Button: false, BaseWave: false } }
    })
    const [renewButton, manageButton] = wrapper.findAllComponents(NButton)
    expect(renewButton.props()).toMatchObject({ type: 'primary', ghost: true, secondary: false })
    expect(manageButton.text()).toBe(t('subscriptions.actions.manage'))
    await renewButton.trigger('click')
    expect(wrapper.emitted('renew')).toEqual([['sub-1', 'Tools']])
    await manageButton.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ name: 'subscriptions', query: { subscriptionId: 'sub-1' } })
    await wrapper.setProps({ renewing: true })
    expect(renewButton.props()).toMatchObject({ loading: true, disabled: true })
    expect(manageButton.props('disabled')).toBe(false)
    wrapper.unmount()
  })

  it('also offers yearly tag spend on the statistics page', () => {
    const source = readFileSync('src/pages/StatisticsPage.vue', 'utf8')
    expect(source).toContain('v-model:value="tagSpendPeriod"')
    expect(source).toContain('overview.value?.tagSpendYearly')
  })
})
