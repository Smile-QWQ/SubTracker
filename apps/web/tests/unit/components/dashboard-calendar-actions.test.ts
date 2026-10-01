import { readFileSync } from 'node:fs'
import { shallowMount } from '@vue/test-utils'
import { NButton, NCalendar } from 'naive-ui'
import { BagCheckOutline, CashOutline } from '@vicons/ionicons5'
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

  it('shows both spending periods in one tooltip and displays lifetime investment', () => {
    const wrapper = shallowMount(DashboardPage, { global })
    const chart = wrapper.findComponent({ name: 'ChartView' })
    expect(chart.props('option').series[0].data).toEqual([{ name: 'Tools', value: 10 }])
    expect(wrapper.findComponent({ name: 'RadioGroup' }).exists()).toBe(false)
    const tooltip = chart.props('option').tooltip.formatter({ dataIndex: 0 })
    expect(tooltip.textContent).toContain('USD 10.00')
    expect(tooltip.textContent).toContain('USD 120.00')
    expect(tooltip.textContent).toContain('100.00%')
    expect(wrapper.findAllComponents({ name: 'StatCard' }).map((item) => item.props('value'))).toContain('USD 300.00')
    wrapper.unmount()
  })

  it('distinguishes lifetime investment from yearly spending with a purchase icon', () => {
    const wrapper = shallowMount(DashboardPage, { global })
    const cards = wrapper.findAllComponents({ name: 'StatCard' })
    const yearly = cards.find(card => card.props('label') === t('dashboard.cards.estimatedYearlySpend'))
    const lifetime = cards.find(card => card.props('label') === t('dashboard.cards.lifetimeTotal'))
    expect(yearly?.props('icon')).toBe(CashOutline)
    expect(lifetime?.props('icon')).toBe(BagCheckOutline)
    expect(lifetime?.props('icon')).not.toBe(yearly?.props('icon'))
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

  it('uses the same dual-period tooltip on the statistics page', () => {
    const source = readFileSync('src/pages/StatisticsPage.vue', 'utf8')
    expect(source).toContain('computed(() => buildTagSpendOption(')
    expect(source).not.toContain('tagSpendPeriod')
    expect(source).toContain('overview.value?.tagSpendYearly')
  })
})
