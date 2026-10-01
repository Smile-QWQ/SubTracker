import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Subscription } from '@/types/api'

const mocks = vi.hoisted(() => ({ renew: vi.fn(), get: vi.fn(), batch: vi.fn(), invalidate: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('@tanstack/vue-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }))
vi.mock('@/composables/api', () => ({ api: { renewSubscription: mocks.renew, getSubscription: mocks.get, batchRenewSubscriptions: mocks.batch } }))
vi.mock('@/utils/localized-message', () => ({ useLocalizedMessage: () => ({ success: mocks.success, warning: mocks.warning, error: mocks.error }) }))
import { useSubscriptionRenewal } from '@/composables/subscription-renewal'
const row=(id:string,overrides:Partial<Subscription>={})=>({id,name:id,amount:30,currency:'CNY',status:'active',billingType:'recurring',...overrides} as Subscription)

describe('subscription renewal confirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.get.mockImplementation(async id=>row(id))
    mocks.invalidate.mockResolvedValue(undefined)
    mocks.renew.mockResolvedValue({})
  })
  it('loads current price but does not renew until confirmed, and cancellation is safe',async()=>{
    const state=useSubscriptionRenewal()
    await state.renew('a','A')
    expect(state.renewalOpen.value).toBe(true)
    expect(state.renewalSubscriptions.value[0].amount).toBe(30)
    expect(mocks.renew).not.toHaveBeenCalled()
    state.cancelRenewal()
    await state.confirmRenewal([{id:'a',amount:0,currency:'CNY'}])
    expect(mocks.renew).not.toHaveBeenCalled()
  })
  it('records zero payment once and refreshes historical spending and all affected views',async()=>{
    let finish!:()=>void
    mocks.renew.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}))
    const state=useSubscriptionRenewal()
    await state.renew('a','A')
    const request=state.confirmRenewal([{id:'a',amount:0,currency:'USD'}])
    await state.confirmRenewal([{id:'a',amount:0,currency:'USD'}])
    state.cancelRenewal()
    expect(state.renewalOpen.value).toBe(true)
    expect(mocks.renew).toHaveBeenCalledExactlyOnceWith('a',{amount:0,currency:'USD'})
    expect(state.renewingIds.value.has('a')).toBe(true)
    finish();await request
    expect(state.renewingIds.value.size).toBe(0)
    expect(state.renewalOpen.value).toBe(false)
    for(const key of ['subscriptions','payment-history','statistics-overview','calendar-events','subscription-detail']) expect(mocks.invalidate).toHaveBeenCalledWith({queryKey:[key]})
  })
  it('blocks concurrent opening and lifetime subscriptions',async()=>{
    let finish!:(value:Subscription)=>void
    mocks.get.mockImplementation(()=>new Promise<Subscription>(resolve=>{finish=resolve}))
    const state=useSubscriptionRenewal()
    const request=state.renew('a','A');await state.renew('a','A')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    finish(row('a',{billingType:'lifetime'}));await request
    expect(state.renewalOpen.value).toBe(false)
    expect(mocks.error).toHaveBeenCalledOnce()
  })
  it('keeps an unsuccessful single payment open for correction',async()=>{
    mocks.renew.mockRejectedValueOnce(new Error('Payment failed'))
    const state=useSubscriptionRenewal()
    await state.renew('a','A')
    await state.confirmRenewal([{id:'a',amount:10}])
    expect(state.renewalOpen.value).toBe(true)
    expect(state.renewalSaving.value).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith('Payment failed')
    await state.confirmRenewal([{id:'a',amount:10}])
    expect(mocks.renew).toHaveBeenCalledTimes(2)
  })
  it('keeps only failed batch rows for retry and preserves mixed-currency overrides',async()=>{
    mocks.batch.mockResolvedValueOnce({successCount:1,failureCount:1,failures:[{id:'b',message:'Try again'}]}).mockResolvedValueOnce({successCount:1,failureCount:0,failures:[]})
    const onRenewed=vi.fn().mockResolvedValue(undefined)
    const state=useSubscriptionRenewal({onRenewed})
    state.renewMany([row('a'),row('b',{currency:'USD'}),row('life',{billingType:'lifetime'})])
    expect(mocks.batch).not.toHaveBeenCalled()
    await state.confirmRenewal([{id:'b',amount:0,currency:'USD'}])
    expect(mocks.batch).toHaveBeenNthCalledWith(1,['a','b'],[{id:'b',amount:0,currency:'USD'}])
    expect(state.renewalSubscriptions.value.map(s=>s.id)).toEqual(['b'])
    expect(state.renewalErrors.value).toEqual({b:'Try again'})
    expect(onRenewed).toHaveBeenCalledWith(['a'])
    await state.confirmRenewal([{id:'b',amount:0,currency:'USD'}])
    expect(mocks.batch).toHaveBeenNthCalledWith(2,['b'],[{id:'b',amount:0,currency:'USD'}])
    expect(state.renewalOpen.value).toBe(false)
  })
  it('does not allow a successful renewal to be retried because refreshing failed',async()=>{
    mocks.invalidate.mockRejectedValue(new Error('Refresh failed'))
    const state=useSubscriptionRenewal()
    await state.renew('a','A');await state.confirmRenewal([{id:'a',amount:12}])
    expect(state.renewalOpen.value).toBe(false)
    await state.confirmRenewal([{id:'a',amount:12}])
    expect(mocks.renew).toHaveBeenCalledOnce()
  })
})
