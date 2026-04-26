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

  it('should project renewal ids by configured timezone business date', () => {
    const events = projectRenewalEvents(
      [
        {
          id: 'sub_tz',
          name: 'Timezone Service',
          amount: 88,
          currency: 'USD',
          status: 'active' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month' as const,
          nextRenewalDate: new Date('2026-04-09T16:00:00.000Z')
        }
      ],
      {
        start: '2026-04-01',
        end: '2026-04-30',
        timezone: 'Asia/Shanghai'
      }
    )

    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBe('sub_tz:2026-04-10')
  })

  it('should fast-forward old daily subscriptions without changing projected dates', () => {
    const events = projectRenewalEvents(
      [
        {
          id: 'sub_daily',
          name: 'Daily Service',
          amount: 1,
          currency: 'CNY',
          status: 'active' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'day' as const,
          nextRenewalDate: new Date('2025-06-01T00:00:00.000Z')
        }
      ],
      {
        start: '2026-04-01',
        end: '2026-04-03'
      }
    )

    expect(events.map((item) => item.id)).toEqual([
      'sub_daily:2026-04-01',
      'sub_daily:2026-04-02',
      'sub_daily:2026-04-03'
    ])
  })

  it('should preserve monthly overflow semantics when fast-forwarding old subscriptions', () => {
    const events = projectRenewalEvents(
      [
        {
          id: 'sub_monthly_old',
          name: 'Old Monthly Service',
          amount: 20,
          currency: 'CNY',
          status: 'active' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month' as const,
          nextRenewalDate: new Date('2025-01-31T00:00:00.000Z')
        }
      ],
      {
        start: '2026-04-01',
        end: '2026-04-30'
      }
    )

    expect(events.map((item) => item.id)).toEqual(['sub_monthly_old:2026-04-28'])
  })

  it('should skip final sorting when sortResult is false', () => {
    const events = projectRenewalEvents(
      [
        {
          id: 'sub_late',
          name: 'Late Service',
          amount: 20,
          currency: 'CNY',
          status: 'active' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month' as const,
          nextRenewalDate: new Date('2026-04-20T00:00:00.000Z')
        },
        {
          id: 'sub_early',
          name: 'Early Service',
          amount: 10,
          currency: 'CNY',
          status: 'active' as const,
          billingIntervalCount: 1,
          billingIntervalUnit: 'month' as const,
          nextRenewalDate: new Date('2026-04-10T00:00:00.000Z')
        }
      ],
      {
        start: '2026-04-01',
        end: '2026-04-30',
        sortResult: false
      }
    )

    expect(events.map((item) => item.id)).toEqual(['sub_late:2026-04-20', 'sub_early:2026-04-10'])
  })
})
