import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  renew: vi.fn(), invalidate: vi.fn(), success: vi.fn(), error: vi.fn()
}))
vi.mock('@tanstack/vue-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }))
vi.mock('@/composables/api', () => ({ api: { renewSubscription: mocks.renew } }))
vi.mock('@/utils/localized-message', () => ({ useLocalizedMessage: () => ({ success: mocks.success, error: mocks.error }) }))

import { useSubscriptionRenewal } from '@/composables/subscription-renewal'

describe('quick subscription renewal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('prevents duplicate clicks and refreshes all affected views after payment succeeds', async () => {
    let finish!: () => void
    mocks.renew.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const { renew, renewingIds } = useSubscriptionRenewal()
    const request = renew('sub-1', 'License')
    await renew('sub-1', 'License')
    expect(mocks.renew).toHaveBeenCalledTimes(1)
    expect(mocks.renew).toHaveBeenCalledWith('sub-1')
    expect(renewingIds.value.has('sub-1')).toBe(true)
    finish()
    await request
    expect(renewingIds.value.size).toBe(0)
    for (const key of ['subscriptions', 'statistics-overview', 'statistics-budgets', 'calendar-events']) {
      expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: [key] })
    }
    expect(mocks.success).toHaveBeenCalledOnce()
  })

  it('reports failures and releases pending state so the user can retry', async () => {
    mocks.renew.mockRejectedValueOnce(new Error('Payment failed')).mockResolvedValueOnce({})
    const { renew, renewingIds } = useSubscriptionRenewal()
    await renew('sub-1', 'License')
    expect(mocks.error).toHaveBeenCalledWith('Payment failed')
    expect(mocks.invalidate).not.toHaveBeenCalled()
    expect(renewingIds.value.size).toBe(0)
    await renew('sub-1', 'License')
    expect(mocks.renew).toHaveBeenCalledTimes(2)
    expect(mocks.success).toHaveBeenCalledOnce()
  })
})
