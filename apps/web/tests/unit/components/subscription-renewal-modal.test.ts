import { afterEach, describe, expect, it, vi } from 'vitest'
import { shallowMount, type VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { NButton, NInputNumber, NSelect } from 'naive-ui'
import SubscriptionRenewalModal from '@/components/SubscriptionRenewalModal.vue'
import type { Subscription } from '@/types/api'
import { t } from '@/locales'
vi.mock('@/composables/exchange-rate-query',()=>({useExchangeRateSnapshotQuery:()=>({data:ref({baseCurrency:'CNY',rates:{USD:0.14,CNY:1}})})}))
const rows=[{id:'a',name:'Service A',amount:88,currency:'CNY'},{id:'b',name:'Service B',amount:5,currency:'USD'}] as Subscription[]
const wrappers:VueWrapper[]=[]
function mount(props:Record<string,unknown>={}){const wrapper=shallowMount(SubscriptionRenewalModal,{props:{show:true,batch:false,saving:false,subscriptions:[rows[0]],...props},global:{renderStubDefaultSlot:true,stubs:{Button:false,BaseWave:false,Modal:{template:'<div><slot /><slot name="footer" /></div>'}}}});wrappers.push(wrapper);return wrapper}
function button(wrapper:VueWrapper,key:string){return wrapper.findAllComponents(NButton).find(b=>b.text().startsWith(t('subscriptions.renewal.'+key)))!}
afterEach(()=>{for(const wrapper of wrappers.splice(0))wrapper.unmount()})
describe('actual-payment renewal dialog',()=>{
  it('defaults to list price, accepts zero, and cancel does not submit',async()=>{
    const wrapper=mount()
    expect(wrapper.getComponent(NInputNumber).props('value')).toBe(88)
    expect(wrapper.getComponent(NSelect).props('filterable')).toBe(true)
    wrapper.getComponent(NInputNumber).vm.$emit('update:value',0)
    await button(wrapper,'confirm').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([[{id:'a',amount:0,currency:'CNY'}]])
    const other=mount()
    await other.findAllComponents(NButton).find(b=>b.text()===t('common.actions.cancel'))!.trigger('click')
    expect(other.emitted('close')).toHaveLength(1)
    expect(other.emitted('confirm')).toBeUndefined()
  })
  it('submits default batch prices without overrides and allows adjusting selected items',async()=>{
    const wrapper=mount({batch:true,subscriptions:rows})
    expect(wrapper.findAllComponents(NInputNumber)).toHaveLength(0)
    await button(wrapper,'confirm').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([[]])
    await button(wrapper,'adjustAmounts').trigger('click')
    expect(wrapper.findAllComponents(NInputNumber).map(c=>c.props('value'))).toEqual([88,5])
    wrapper.findAllComponents(NInputNumber)[0].vm.$emit('update:value',68)
    await button(wrapper,'hideAmounts').trigger('click')
    await button(wrapper,'confirm').trigger('click')
    expect(wrapper.emitted('confirm')?.at(-1)).toEqual([[{id:'a',amount:68,currency:'CNY'}]])
    expect(rows[0].amount).toBe(88)
  })
  it('blocks empty or negative amounts and ignores submission during saving',async()=>{
    const wrapper=mount()
    for(const amount of [null,-1]){wrapper.getComponent(NInputNumber).vm.$emit('update:value',amount);await button(wrapper,'confirm').trigger('click')}
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.text()).toContain(t('subscriptions.renewal.invalidAmount'))
    await wrapper.setProps({saving:true})
    wrapper.getComponent(NInputNumber).vm.$emit('update:value',1)
    await button(wrapper,'confirm').trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
  it('preserves only failed-row draft amounts and resets drafts after closing',async()=>{
    const wrapper=mount({batch:true,subscriptions:rows})
    await button(wrapper,'adjustAmounts').trigger('click')
    wrapper.findAllComponents(NInputNumber)[1].vm.$emit('update:value',0);await nextTick()
    await wrapper.setProps({subscriptions:[rows[1]],errors:{b:'Unavailable'}})
    expect(wrapper.getComponent(NInputNumber).props('value')).toBe(0)
    expect(wrapper.text()).toContain('Unavailable')
    await wrapper.setProps({show:false});await wrapper.setProps({show:true,subscriptions:rows,errors:{}})
    await button(wrapper,'adjustAmounts').trigger('click')
    expect(wrapper.findAllComponents(NInputNumber).map(c=>c.props('value'))).toEqual([88,5])
  })
})
