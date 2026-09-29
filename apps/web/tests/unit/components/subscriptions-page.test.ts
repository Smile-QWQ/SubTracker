import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive, ref, type VNode } from 'vue'
import { NButton, NDataTable, NInput, NPagination, NSelect } from 'naive-ui'
import { setStoredSubscriptionPageSize } from '@/utils/subscription-pagination'
import SubscriptionsPage from '@/pages/SubscriptionsPage.vue'
import SubscriptionFormModal from '@/components/SubscriptionFormModal.vue'
import { api } from '@/composables/api'
import { t } from '@/locales'
import type { Subscription } from '@/types/api'

const width = ref(600)
const records = ref<Subscription[]>()
const isFetching = ref(false)
const route = reactive({ query: {} as Record<string, string | string[]> })
const scrollIntoView = vi.fn()
vi.mock('vue-router', () => ({ useRoute: () => route }))
const messages = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }))
const invalidateQueries = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@vueuse/core')>(), useWindowSize: () => ({ width })
}))
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({ data: records, isFetching, refetch: vi.fn().mockResolvedValue(undefined) }),
  useQueryClient: () => ({ invalidateQueries })
}))
vi.mock('@/composables/settings-query', () => ({ useSettingsQuery: () => ({ data: ref({ baseCurrency: 'EUR', timezone: 'UTC' }) }) }))
vi.mock('@/composables/tags-query', () => ({ TAGS_QUERY_KEY: ['tags'], useTagsQuery: () => ({ data: ref([]) }) }))
vi.mock('@/composables/exchange-rate-query', () => ({ useExchangeRateSnapshotQuery: () => ({ data: ref(undefined) }) }))
vi.mock('@/utils/localized-message', () => ({ useLocalizedMessage: () => messages }))
vi.mock('@/composables/api', () => ({ api: {
  createSubscription: vi.fn().mockResolvedValue({}), updateSubscription: vi.fn().mockResolvedValue({}),
  batchRenewSubscriptions: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
  renewSubscription: vi.fn().mockResolvedValue({})
} }))

const legacy: Subscription = {
  id: 'legacy', name: 'Monthly subscription', description: '', amount: 5, currency: 'USD',
  billingIntervalCount: 1, billingIntervalUnit: 'month', autoRenew: true,
  startDate: '2026-01-01', nextRenewalDate: '2040-02-01',
  webhookEnabled: true, notes: '', status: 'active', notifyDaysBefore: 3,
  createdAt: '2026-01-01', updatedAt: '2026-01-01'
}
const lifetime: Subscription = { ...legacy, id: 'lifetime', name: 'Lifetime license', billingType: 'lifetime', nextRenewalDate: '2026-01-01' }
const wrappers: VueWrapper[] = []
function mountPage() {
  const wrapper = shallowMount(SubscriptionsPage, {
    global: { renderStubDefaultSlot: true, stubs: { Button: false, BaseWave: false, Pagination: false } }
  })
  wrappers.push(wrapper)
  return wrapper
}
function buttons(wrapper: VueWrapper, text: string) {
  return wrapper.findAllComponents(NButton).filter((item) => item.text() === text)
}
function findButton(wrapper: VueWrapper, text: string) {
  const result = buttons(wrapper, text)[0]
  if (!result) throw new Error(`Missing button: ${text}`)
  return result
}

beforeEach(() => {
  width.value = 600
  records.value = [{ ...legacy }, { ...lifetime }]
  route.query = {}
  isFetching.value = false
  window.localStorage.clear()
  Element.prototype.scrollIntoView = scrollIntoView
  vi.clearAllMocks()
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.useRealTimers()
})

describe('SubscriptionsPage copy and renewal actions', () => {
  it('offers copy on mobile and opens prefilled create mode that saves through create, not update', async () => {
    const wrapper = mountPage()
    const copyButtons = buttons(wrapper, t('subscriptions.actions.copy'))
    expect(copyButtons).toHaveLength(2)
    await copyButtons[1].trigger('click')
    const form = wrapper.getComponent(SubscriptionFormModal)
    expect(form.props('show')).toBe(true)
    expect(form.props('model')).toBeNull()
    expect(form.props('initialValues')).toMatchObject({ name: lifetime.name, currency: 'USD', billingType: 'lifetime' })
    expect(form.props('initialValues')).not.toHaveProperty('id')
    const payload = { name: lifetime.name, billingType: 'lifetime' }
    form.vm.$emit('submit', payload, undefined)
    await flushPromises()
    expect(api.createSubscription).toHaveBeenCalledWith(payload)
    expect(api.updateSubscription).not.toHaveBeenCalled()
    expect(form.props('show')).toBe(false)
    expect(form.props('initialValues')).toBeNull()
    await findButton(wrapper, t('subscriptions.actions.create')).trigger('click')
    expect(form.props('initialValues')).toBeNull()
    expect(form.props('model')).toBeNull()
  })

  it('hides lifetime renewal controls and placeholder renewal dates on mobile', async () => {
    const wrapper = mountPage()
    const cards = wrapper.findAll('.mobile-subscription-card')
    expect(cards[1].text()).toContain(t('subscriptions.billingType.lifetime'))
    expect(cards[1].find('.mobile-subscription-card__rows').exists()).toBe(false)
    expect(cards[0].find('.mobile-subscription-card__rows').exists()).toBe(true)
    const renewButtons = buttons(wrapper, t('subscriptions.actions.renew'))
    expect(renewButtons).toHaveLength(1)
    await renewButtons[0].trigger('click')
    await flushPromises()
    expect(api.renewSubscription).toHaveBeenCalledWith('legacy')
  })

  it('excludes lifetime ids from mixed batch renewals and disables all-lifetime batches', async () => {
    const wrapper = mountPage()
    await findButton(wrapper, t('subscriptions.page.batchMode')).trigger('click')
    await findButton(wrapper, t('subscriptions.page.selectCurrentPage')).trigger('click')
    await findButton(wrapper, t('subscriptions.actions.batchRenew')).trigger('click')
    await flushPromises()
    expect(api.batchRenewSubscriptions).toHaveBeenCalledWith(['legacy'])
    expect(messages.warning).toHaveBeenCalledWith(t('subscriptions.batch.lifetimeRenewSkipped', { count: 1 }))

    records.value = [{ ...lifetime }]
    await nextTick()
    expect(findButton(wrapper, t('subscriptions.actions.batchRenew')).props('disabled')).toBe(true)
    await findButton(wrapper, t('subscriptions.actions.batchRenew')).trigger('click')
    expect(api.batchRenewSubscriptions).toHaveBeenCalledTimes(1)
  })

  it('offers desktop copy while displaying lifetime text and no renewal action/date', async () => {
    width.value = 1200
    const wrapper = mountPage()
    const columns = wrapper.getComponent(NDataTable).props('columns') as Array<{ key: string; render: (row: unknown) => VNode | string }>
    const row = { ...lifetime, __rowType: 'main' }
    expect(columns.find((column) => column.key === 'interval')!.render(row)).toBe(t('subscriptions.billingType.lifetime'))
    expect(columns.find((column) => column.key === 'nextRenewalDate')!.render(row)).toBe('—')
    const actions = columns.find((column) => column.key === 'actions')!.render(row) as VNode
    const actionNodes = (actions.children as { default: () => VNode[] }).default()
    const label = (node: VNode) => (node.children as { default: () => string }).default()
    const copyAction = actionNodes.find((node) => label(node) === t('subscriptions.actions.copy'))!
    expect(copyAction).toBeDefined()
    expect(actionNodes.some((node) => label(node) === t('subscriptions.actions.renew'))).toBe(false)
    copyAction.props!.onClick()
    await nextTick()
    expect(wrapper.getComponent(SubscriptionFormModal).props('model')).toBeNull()
    expect(wrapper.getComponent(SubscriptionFormModal).props('initialValues')).toMatchObject({ name: lifetime.name })
  })

  it('uses a 40px unframed contain logo style for mobile and desktop render functions', () => {
    const source = readFileSync('src/pages/SubscriptionsPage.vue', 'utf8')
    expect(source).toContain("class: 'subscription-logo'")
    expect(source).toContain('class="subscription-logo"')
    expect(source).toContain(':deep(.subscription-logo) {')
    expect(source).toContain('width: 40px;')
    expect(source).toContain('height: 40px;')
    expect(source).toContain('flex: 0 0 40px;')
    expect(source).toContain('padding: 0;')
    expect(source).toContain('border: 0;')
    expect(source).toContain('object-fit: contain;')
    expect(source).not.toContain('logoImageStyle')
  })
})

describe('SubscriptionsPage management deep links', () => {
  it('waits for fetched records, then scrolls to and highlights the exact mobile card', async () => {
    records.value = undefined
    isFetching.value = true
    route.query = { subscriptionId: 'lifetime' }
    const wrapper = mountPage()
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(messages.warning).not.toHaveBeenCalled()
    records.value = [{ ...legacy }, { ...lifetime }]
    isFetching.value = false
    await flushPromises()
    const card = wrapper.get('[data-subscription-id="lifetime"]')
    expect(card.classes()).toContain('mobile-subscription-card--focused')
    expect(card.attributes('tabindex')).toBe('-1')
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth', block: 'center' })
    expect(scrollIntoView.mock.contexts[0]).toBe(card.element)
  })

  it('opens the correct desktop page using the stored page size and targets the main row, not notes', async () => {
    width.value = 1200
    setStoredSubscriptionPageSize(10)
    records.value = Array.from({ length: 25 }, (_, index) => ({ ...legacy, id: `sub-${index}`, notes: 'A note' }))
    route.query = { subscriptionId: 'sub-21' }
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.getComponent(NPagination).props('page')).toBe(3)
    const table = wrapper.getComponent(NDataTable)
    const data = table.props('data')!
    const target = data.find(row => row.id === 'sub-21')!
    const props = table.props('rowProps')!(target, 0)
    expect(props).toMatchObject({ 'data-subscription-id': 'sub-21', tabindex: -1 })
    expect(props.class).toContain('subscription-row--focused')
    const note = data.find(row => row.__rowType === 'note' && row.subscriptionId === 'sub-21')!
    expect(table.props('rowProps')!(note, 0)['data-subscription-id']).toBeUndefined()
    wrapper.getComponent(NPagination).vm.$emit('update:page', 1)
    await nextTick()
    expect(wrapper.getComponent(NPagination).props('page')).toBe(1)
  })

  it('responds to same-page navigation and clears filters and batch mode before locating', async () => {
    const wrapper = mountPage()
    wrapper.getComponent(NInput).vm.$emit('update:value', 'hidden')
    wrapper.findAllComponents(NSelect)[0].vm.$emit('update:value', 'paused')
    await findButton(wrapper, t('subscriptions.page.batchMode')).trigger('click')
    route.query = { subscriptionId: 'legacy' }
    await flushPromises()
    expect(wrapper.getComponent(NInput).props('value')).toBe('')
    expect(wrapper.findAllComponents(NSelect)[0].props('value')).toBeNull()
    expect(buttons(wrapper, t('subscriptions.page.batchMode'))).toHaveLength(1)
    expect(wrapper.get('[data-subscription-id="legacy"]').classes()).toContain('mobile-subscription-card--focused')
    route.query = { subscriptionId: 'lifetime' }
    await flushPromises()
    expect(wrapper.get('[data-subscription-id="legacy"]').classes()).not.toContain('mobile-subscription-card--focused')
    expect(wrapper.get('[data-subscription-id="lifetime"]').classes()).toContain('mobile-subscription-card--focused')
  })

  it.each([600, 1200])('clears the highlight after 3 seconds without re-highlighting on data refresh at width %i', async (viewportWidth) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    width.value = viewportWidth
    route.query = { subscriptionId: 'legacy' }
    const wrapper = mountPage()
    await flushPromises()
    const isHighlighted = () => viewportWidth < 960
      ? wrapper.get('[data-subscription-id="legacy"]').classes().includes('mobile-subscription-card--focused')
      : String(wrapper.getComponent(NDataTable).props('rowProps')!({ ...legacy, __rowType: 'main' }, 0).class).includes('subscription-row--focused')
    expect(isHighlighted()).toBe(true)
    await vi.advanceTimersByTimeAsync(2999)
    expect(isHighlighted()).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(isHighlighted()).toBe(false)
    if (viewportWidth < 960) {
      expect(wrapper.get('[data-subscription-id="legacy"]').attributes('tabindex')).toBeUndefined()
    }
    records.value = [{ ...legacy }, { ...lifetime }]
    await flushPromises()
    expect(isHighlighted()).toBe(false)
  })

  it('restarts the highlight duration for a newly located subscription', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    route.query = { subscriptionId: 'legacy' }
    const wrapper = mountPage()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2000)
    route.query = { subscriptionId: 'lifetime' }
    await flushPromises()
    expect(wrapper.get('[data-subscription-id="legacy"]').classes()).not.toContain('mobile-subscription-card--focused')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('[data-subscription-id="lifetime"]').classes()).toContain('mobile-subscription-card--focused')
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.find('.mobile-subscription-card--focused').exists()).toBe(false)
  })

  it('cleans up the highlight timer when the page unmounts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const initialTimers = vi.getTimerCount()
    route.query = { subscriptionId: 'legacy' }
    mountPage()
    await flushPromises()
    expect(vi.getTimerCount()).toBeGreaterThan(initialTimers)
    wrappers.pop()!.unmount()
    expect(vi.getTimerCount()).toBe(initialTimers)
  })

  it('warns for missing records without throwing, and ignores ambiguous repeated ids', async () => {
    route.query = { subscriptionId: 'missing' }
    const wrapper = mountPage()
    await flushPromises()
    expect(messages.warning).toHaveBeenCalledExactlyOnceWith(t('subscriptions.messages.locateNotFound'))
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(wrapper.find('.mobile-subscription-card--focused').exists()).toBe(false)
    route.query = { subscriptionId: ['legacy', 'lifetime'] }
    await flushPromises()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
