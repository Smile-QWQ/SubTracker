import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { NButton, NCheckbox, NFormItem, NInput, NInputNumber, NSelect, NModal } from 'naive-ui'
import PaymentRecordModal from '@/components/PaymentRecordModal.vue'
import { api } from '@/composables/api'
import { t } from '@/locales'
import type { PaymentHistoryRecord } from '@subtracker/shared'
import type { Subscription } from '@/types/api'

const settings=ref({baseCurrency:'CNY',timezone:'UTC'})
const snapshot=ref<{baseCurrency:string;rates:Record<string,number>}|undefined>({baseCurrency:'CNY',rates:{USD:0.14,JPY:20,AUD:0.2}})
vi.mock('@/composables/exchange-rate-query',()=>({useExchangeRateSnapshotQuery:()=>({data:snapshot})}))
const messages=vi.hoisted(()=>({success:vi.fn(),error:vi.fn()}))
vi.mock('@/composables/settings-query',()=>({useSettingsQuery:()=>({data:settings})}))
vi.mock('@/utils/localized-message',()=>({useLocalizedMessage:()=>messages}))
vi.mock('@/composables/api',()=>({api:{createPaymentRecord:vi.fn(),updatePaymentRecord:vi.fn()}}))
const subscription={id:'sub',name:'Subscription',amount:10,currency:'USD'} as Subscription
const original:PaymentHistoryRecord={id:'payment',subscriptionId:'sub',subscription:{id:'sub',name:'Subscription'},amount:10,currency:'USD',baseCurrency:'CNY',convertedAmount:70.03,exchangeRate:7,
  paidAt:'2026-01-12T12:34:56Z',periodStart:'2026-01-01T00:00:00Z',periodEnd:'2026-02-01T00:00:00Z',createdAt:'2026-01-12T12:34:56Z',source:'legacy',rateSource:'legacy',note:'Original',revision:4}
const wrappers:VueWrapper[]=[]
const mount=(record:PaymentHistoryRecord|null=original)=>{const wrapper=shallowMount(PaymentRecordModal,{props:{show:true,record,subscriptionId:'sub',subscriptions:[subscription]},global:{renderStubDefaultSlot:true,stubs:{Button:false,BaseWave:false}}});wrappers.push(wrapper);return wrapper}
const field=(wrapper:VueWrapper,label:string)=>wrapper.findAllComponents(NFormItem).find(row=>row.props('label')===t(label))!
const save=async(wrapper:VueWrapper)=>{await wrapper.findAllComponents(NButton).find(row=>row.text()===t('common.actions.save'))!.trigger('click');await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(api.createPaymentRecord).mockResolvedValue({});vi.mocked(api.updatePaymentRecord).mockResolvedValue({})})
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount()})

describe('payment editor',()=>{
  it('uses searchable subscription-style currency lists and retains historical currencies',async()=>{
    const wrapper=mount({...original,currency:'CHF'})
    const currency=field(wrapper,'paymentHistory.currency').getComponent(NSelect)
    const base=field(wrapper,'paymentHistory.baseCurrency').getComponent(NSelect)
    expect(currency.props('filterable')).toBe(true)
    expect(base.props('filterable')).toBe(true)
    expect(base.props('disabled')).toBe(true)
    expect(currency.props('options')?.map(option=>option.value)).toEqual(expect.arrayContaining(['CHF','CNY','USD','JPY','AUD']))
    field(wrapper,'paymentHistory.conversion').getComponent(NSelect).vm.$emit('update:value','manual')
    await flushPromises()
    base.vm.$emit('update:value','AUD')
    await save(wrapper)
    expect(api.updatePaymentRecord).toHaveBeenCalledWith('payment',expect.objectContaining({currency:'CHF',conversion:expect.objectContaining({mode:'manual',baseCurrency:'AUD'})}))
  })

  it('defaults edits to preserving snapshots and sends the original revision without claiming unknown payments',async()=>{
    const wrapper=mount()
    expect(wrapper.getComponent(NModal).attributes('style')).toContain('680px')
    expect(field(wrapper,'paymentHistory.conversion').getComponent(NSelect).props('value')).toBe('preserve')
    field(wrapper,'paymentHistory.note').getComponent(NInput).vm.$emit('update:value','Corrected')
    await save(wrapper)
    expect(api.updatePaymentRecord).toHaveBeenCalledWith('payment',expect.objectContaining({revision:4,note:'Corrected',confirmManual:false,conversion:{mode:'preserve'},paidAt:'2026-01-12'}))
    expect(api.createPaymentRecord).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })
  it('only changes source after explicitly confirming the payment',async()=>{
    const wrapper=mount({...original,source:'automatic'})
    wrapper.getComponent(NCheckbox).vm.$emit('update:checked',true)
    await save(wrapper)
    expect(api.updatePaymentRecord).toHaveBeenCalledWith('payment',expect.objectContaining({confirmManual:true}))
  })
  it('adds a separate payment with an explicit conversion and does not invoke subscription renewal',async()=>{
    const wrapper=mount(null)
    field(wrapper,'paymentHistory.conversion').getComponent(NSelect).vm.$emit('update:value','manual')
    await flushPromises()
    field(wrapper,'paymentHistory.rate').getComponent(NInputNumber).vm.$emit('update:value',7.5)
    await save(wrapper)
    expect(api.createPaymentRecord).toHaveBeenCalledWith(expect.objectContaining({subscriptionId:'sub',amount:10,currency:'USD',conversion:{mode:'manual',baseCurrency:'CNY',exchangeRate:7.5}}))
    expect(api.updatePaymentRecord).not.toHaveBeenCalled()
  })
  it('blocks invalid form data and keeps conflicts open for correction',async()=>{
    const wrapper=mount()
    field(wrapper,'paymentHistory.currency').getComponent(NSelect).vm.$emit('update:value','INVALID')
    await save(wrapper)
    expect(api.updatePaymentRecord).not.toHaveBeenCalled()
    field(wrapper,'paymentHistory.currency').getComponent(NSelect).vm.$emit('update:value','USD')
    vi.mocked(api.updatePaymentRecord).mockRejectedValueOnce(new Error('conflict'))
    await save(wrapper)
    expect(messages.error).toHaveBeenLastCalledWith('conflict')
    expect(wrapper.emitted('close')).toBeUndefined()
  })
  it('prevents duplicate submits and resets drafts on reopening',async()=>{
    let finish!:()=>void
    vi.mocked(api.updatePaymentRecord).mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({})}))
    const wrapper=mount()
    const button=wrapper.findAllComponents(NButton).find(row=>row.text()===t('common.actions.save'))!
    await button.trigger('click');await button.trigger('click')
    expect(api.updatePaymentRecord).toHaveBeenCalledTimes(1)
    finish();await flushPromises()
    await wrapper.setProps({show:false});await wrapper.setProps({show:true,record:{...original,note:'Latest',revision:5}})
    expect(field(wrapper,'paymentHistory.note').getComponent(NInput).props('value')).toBe('Latest')
  })
})
