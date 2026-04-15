import { describe, expect, it } from 'vitest'
import { projectRenewalEvents } from '../../src/services/projected-renewal.service'

describe('projectRenewalEvents', () => {
  it('should generate one event for a monthly subscription in a single month range', () => {
    const events = projectRenewalEvents(
      [
        {
          id: 'sub_monthly',
          name: 'Monthly Service',
          amount: 30,
          currency: 'CNY',
          status: 'active' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month' as const,
          nextRenewalDate: new Date('2026-04-10T00:00:00.000Z')
        }
      ],
      {
        start: '2026-04-01',
        end: '2026-04-30'
      }
    )

    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBe('sub_monthly:2026-04-10')
  })

  it('should generate multiple weekly events in the same month', () => {
    const events = projectRenewalEvents(
      [
        {
          id: 'sub_weekly',
          name: 'Weekly Service',
          amount: 5,
          currency: 'USD',
          status: 'active' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'week' as const,
          nextRenewalDate: new Date('2026-04-05T00:00:00.000Z')
        }
      ],
      {
        start: '2026-04-01',
        end: '2026-04-30'
      }
    )

    expect(events.map((item) => item.id)).toEqual([
      'sub_weekly:2026-04-05',
      'sub_weekly:2026-04-12',
      'sub_weekly:2026-04-19',
      'sub_weekly:2026-04-26'
    ])
  })

  it('should include expired subscriptions when status is allowed', () => {
    const events = projectRenewalEvents(
      [
        {
          id: 'sub_expired',
          name: 'Expired Service',
          amount: 12,
          currency: 'EUR',
          status: 'expired' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month' as const,
          nextRenewalDate: new Date('2026-03-15T00:00:00.000Z')
        }
      ],
      {
        start: '2026-04-01',
        end: '2026-04-30',
        statuses: ['active', 'expired']
      }
    )

    expect(events).toHaveLength(1)
    expect(events[0]?.status).toBe('expired')
    expect(events[0]?.id).toBe('sub_expired:2026-04-15')
  })

  it('should exclude paused and cancelled subscriptions from projected events', () => {
    const events = projectRenewalEvents(
      [
        {
          id: 'sub_paused',
          name: 'Paused Service',
          amount: 10,
          currency: 'USD',
          status: 'paused' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month' as const,
          nextRenewalDate: new Date('2026-04-10T00:00:00.000Z')
        },
        {
          id: 'sub_cancelled',
          name: 'Cancelled Service',
          amount: 20,
          currency: 'USD',
          status: 'cancelled' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month' as const,
          nextRenewalDate: new Date('2026-04-11T00:00:00.000Z')
        }
      ],
      {
        start: '2026-04-01',
        end: '2026-04-30',
        statuses: ['active', 'expired']
      }
    )

    expect(events).toHaveLength(0)
  })
})
