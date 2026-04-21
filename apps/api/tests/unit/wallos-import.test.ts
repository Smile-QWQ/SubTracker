import { describe, expect, it } from 'vitest'
import {
  mapWallosBillingInterval,
  mapWallosSubscriptionStatus,
  previewWallosImportFromBase64ForTest,
  resolveWallosNotifyDays
} from '../../src/services/wallos-import.service'

function encodeJson(rows: unknown[]) {
  return Buffer.from(JSON.stringify(rows), 'utf8').toString('base64')
}

describe('wallos import helpers', () => {
  it('maps standard billing intervals', () => {
    expect(mapWallosBillingInterval(30, 2)).toMatchObject({
      billingIntervalCount: 2,
      billingIntervalUnit: 'month',
      warning: null
    })

    expect(mapWallosBillingInterval(45, 1)).toMatchObject({
      billingIntervalCount: 45,
      billingIntervalUnit: 'day'
    })
  })

  it('maps status and notify config', () => {
    expect(mapWallosSubscriptionStatus({ inactive: 1, cancellationDate: null, nextPayment: '2026-06-01' })).toBe('paused')
    expect(mapWallosSubscriptionStatus({ inactive: 0, cancellationDate: '2026-04-01', nextPayment: '2026-06-01' })).toBe(
      'cancelled'
    )
    expect(resolveWallosNotifyDays({ notify: 1, notifyDaysBefore: -1, globalNotifyDays: 3 })).toEqual({
      webhookEnabled: true,
      notifyDaysBefore: 3
    })
  })

  it('only accepts wallos json in worker lite and keeps used tags only', async () => {
    const preview = await previewWallosImportFromBase64ForTest(
      {
        filename: 'wallos.json',
        contentType: 'application/json',
        base64: encodeJson([
          {
            Name: 'Test VPS',
            Price: '$10.00',
            Category: 'VPS',
            'Next Payment': '2026-06-01',
            Notifications: 'enabled',
            Renewal: 'automatic',
            Notes: 'note',
            URL: 'https://example.com/a'
          },
          {
            Name: 'No category sub',
            Price: '¥5',
            Category: 'No category',
            'Next Payment': '2026-07-01',
            Notifications: 'disabled',
            Renewal: 'manual'
          },
          {
            Name: '',
            Price: '$1',
            Category: 'UnusedTag',
            'Next Payment': ''
          }
        ])
      },
      {
        defaultNotifyDays: 3,
        baseCurrency: 'CNY'
      }
    )

    expect(preview.isWallos).toBe(true)
    expect(preview.summary.fileType).toBe('json')
    expect(preview.usedTags.map((item) => item.name)).toEqual(['VPS'])
    expect(preview.summary.usedTagsTotal).toBe(1)
    expect(preview.summary.skippedSubscriptions).toBe(1)
    expect(preview.summary.zipLogoMatched).toBe(0)

    const uncategorized = preview.subscriptionsPreview.find((item) => item.name === 'No category sub')
    expect(uncategorized?.tagNames).toEqual([])

    const categorized = preview.subscriptionsPreview.find((item) => item.name === 'Test VPS')
    expect(categorized?.tagNames).toEqual(['VPS'])
    expect(categorized?.autoRenew).toBe(true)
    expect(categorized?.logoImportStatus).toBe('none')
  })
})
