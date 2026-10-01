import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { NButton, NSelect, NDatePicker, NDataTable, NModal } from 'naive-ui'
import PaymentHistoryPanel from '@/components/PaymentHistoryPanel.vue'
import PaymentRecordModal from '@/components/PaymentRecordModal.vue'
import ChartView from '@/components/ChartView.vue'
import { api } from '@/composables/api'
import { t } from '@/locales'

const width=ref(1200)
const settings=ref({baseCurrency:'CNY',timezone:'UTC'})
const mocks=vi.hoisted(()=>({success:vi.fn(),error:vi.fn()}))
vi.mock('@vueuse/core',async original=>({...await original<typeof import('@vueuse/core')>(),useWindowSize:()=>({width})}))
vi.mock('@/utils/localized-message',()=>({useLocalizedMessage:()=>mocks}))
vi.mock('@/composables/settings-query',()=>({useSettingsQuery:()=>({data:settings})}))
vi.mock('@/composables/api',()=>({api:{getPaymentRecords:vi.fn(),getPaymentSummary:vi.fn(),getSubscriptions:vi.fn(),getTags:vi.fn(),deletePaymentRecord:vi.fn()}}))
const row={id:'payment',subscriptionId:'sub',subscription:{id:'sub',name:'<b>Unsafe label</b>'},amount:10,currency:'USD',baseCurrency:'CNY',convertedAmount:72,exchangeRate:7.2,source:'legacy',rateSource:'legacy',note:'Note',revision:2,paidAt:'2026-01-12',periodStart:'2026-01-01',periodEnd:'2026-02-01',createdAt:'2026-01-12'}
const summary={totals:[{currency:'CNY',amount:72,count:1,manual:0,automatic:0,legacy:1},{currency:'EUR',amount:3,count:1,manual:1,automatic:0,legacy:0}],thisYear:[],count:2,
  monthly:[{month:'2026-01',currency:'CNY',amount:72,count:1},{month:'2026-01',currency:'EUR',amount:3,count:1}],subscriptions:[{id:'sub',name:'<b>Unsafe label</b>',currency:'CNY',amount:72,count:1}]}
const wrappers:VueWrapper[]=[];const clients:QueryClient[]=[]
function mount(props={}, cachedClient?:QueryClient) {const client=cachedClient??new QueryClient({defaultOptions:{queries:{retry:false}}});if(!cachedClient)clients.push(client);const wrapper=shallowMount(PaymentHistoryPanel,{props:{charts:true,...props},global:{plugins:[[VueQueryPlugin,{queryClient:client}]],renderStubDefaultSlot:true,stubs:{Button:false,BaseWave:false,NPagination:{template:'<div />',inheritAttrs:false}}}});wrappers.push(wrapper);return wrapper}
async function settle(){await flushPromises();await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();width.value=1200;vi.mocked(api.getPaymentSummary).mockResolvedValue(summary);vi.mocked(api.getPaymentRecords).mockResolvedValue({items:[row] as any,total:1,page:1,pageSize:20});vi.mocked(api.getSubscriptions).mockResolvedValue([{id:'sub',name:'Subscription'}] as any);vi.mocked(api.getTags).mockResolvedValue([]);vi.mocked(api.deletePaymentRecord).mockResolvedValue({})})
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount();for(const client of clients.splice(0))client.clear()})

describe('historical spending panel',()=>{
  it('omits tag controls and tag requests in both history views',async()=>{
    const global=mount();await settle()
    const single=mount({subscriptionId:'sub'});await settle()
    for(const wrapper of [global,single]) {
      const placeholders=wrapper.findAllComponents(NSelect).map(select=>select.props('placeholder'))
      expect(placeholders).not.toContain(t('paymentHistory.allTags'))
      expect(placeholders).toContain(t('paymentHistory.allSources'))
    }
    expect(global.findAllComponents(NSelect).some(select=>select.props('placeholder')===t('paymentHistory.allSubscriptions'))).toBe(true)
    expect(api.getTags).not.toHaveBeenCalled()
    for(const [query] of vi.mocked(api.getPaymentRecords).mock.calls) expect(query).not.toHaveProperty('tagId')
  })

  it('keeps currency totals separate and identifies automatic and unknown sources',async()=>{
    const wrapper=mount();await settle()
    expect(wrapper.text()).toContain('CNY 72.00');expect(wrapper.text()).toContain('EUR 3.00')
    expect(wrapper.text()).not.toContain('75.00')
    expect(wrapper.text()).toContain(t('paymentHistory.hint'))
    expect(wrapper.find('b').exists()).toBe(false)
  })
  it('initializes charts when returning to a cached history summary',async()=>{
    const first=mount();await settle();first.unmount();wrappers.splice(wrappers.indexOf(first),1)
    const again=mount({},clients[0]);await settle()
    const option=again.getComponent(ChartView).props('option') as any
    expect(option.series[0].name).toBe('CNY')
    expect(option.xAxis.data).toContain('2026-01')
  })
  it('drills a chart month into records of the chart currency without changing summary filters',async()=>{
    const wrapper=mount();await settle()
    wrapper.getComponent(ChartView).vm.$emit('click',{name:'2026-01'})
    await settle()
    expect(api.getPaymentRecords).toHaveBeenLastCalledWith(expect.objectContaining({from:'2026-01-01',to:'2026-01-31',baseCurrency:'CNY'}))
    expect(api.getPaymentSummary).toHaveBeenCalledTimes(1)
    const clear=wrapper.findAllComponents(NButton).find(button=>button.text().includes(t('paymentHistory.clearDrilldown')))!
    await clear.trigger('click');await settle()
    expect(api.getPaymentRecords).toHaveBeenLastCalledWith(expect.objectContaining({from:undefined,to:undefined}))
  })
  it('reacts to source filters and blocks inverted date queries',async()=>{
    const wrapper=mount({subscriptionId:'sub'});await settle()
    const source=wrapper.findAllComponents(NSelect).find(select=>select.props('placeholder')===t('paymentHistory.allSources'))!
    source.vm.$emit('update:value','automatic');await settle()
    expect(api.getPaymentSummary).toHaveBeenLastCalledWith(expect.objectContaining({subscriptionId:'sub',source:'automatic'}))
    const dates=wrapper.findAllComponents(NDatePicker)
    dates[0]!.vm.$emit('update:formatted-value','2026-04-01');await settle()
    const calls=vi.mocked(api.getPaymentSummary).mock.calls.length
    dates[1]!.vm.$emit('update:formatted-value','2026-03-01');await settle()
    expect(wrapper.text()).toContain(t('paymentHistory.errors.period'))
    expect(api.getPaymentSummary).toHaveBeenCalledTimes(calls)
  })
  it('uses mobile cards, opens the correct editor and only deletes after confirmation',async()=>{
    width.value=390
    const wrapper=mount();await settle()
    expect(wrapper.findComponent(NDataTable).exists()).toBe(false)
    const edit=wrapper.findAllComponents(NButton).find(button=>button.text()===t('common.actions.edit'))!
    await edit.trigger('click')
    expect(wrapper.getComponent(PaymentRecordModal).props('record')).toMatchObject({id:'payment',revision:2})
    expect(wrapper.emitted('update:editing')?.at(-1)).toEqual([true])
    const remove=wrapper.findAllComponents(NButton).find(button=>button.text()===t('common.actions.delete'))!
    await remove.trigger('click')
    expect(api.deletePaymentRecord).not.toHaveBeenCalled()
    const confirmation=wrapper.getComponent(NModal)
    expect(confirmation.props('show')).toBe(true)
    confirmation.vm.$emit('update:show',false);await settle()
    expect(api.deletePaymentRecord).not.toHaveBeenCalled()
    await remove.trigger('click');confirmation.vm.$emit('positive-click');await settle()
    expect(api.deletePaymentRecord).toHaveBeenCalledWith('payment',2)
    expect(api.getPaymentSummary).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })
})
