import { createRequire } from 'node:module'
import path from 'node:path'
import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import {
  mapWallosBillingInterval,
  mapWallosSubscriptionStatus,
  previewWallosImportFromBase64ForTest,
  resolveWallosNotifyDays
} from '../../src/services/wallos-import.service'

const require = createRequire(import.meta.url)

async function createWallosFixtureBase64() {
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.resolve(path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm')), file)
  })

  const db = new SQL.Database()
  db.run(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, "order" INTEGER DEFAULT 0, user_id INTEGER DEFAULT 1);
    CREATE TABLE currencies (id INTEGER PRIMARY KEY, name TEXT NOT NULL, symbol TEXT NOT NULL, code TEXT NOT NULL, rate TEXT NOT NULL, user_id INTEGER DEFAULT 1);
    CREATE TABLE cycles (id INTEGER PRIMARY KEY, days INTEGER NOT NULL, name TEXT NOT NULL);
    CREATE TABLE frequencies (id INTEGER PRIMARY KEY, name INTEGER NOT NULL);
    CREATE TABLE notification_settings (days INTEGER DEFAULT 0, user_id INTEGER DEFAULT 1);
    CREATE TABLE subscriptions (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      logo TEXT,
      price REAL NOT NULL,
      currency_id INTEGER,
      next_payment DATE,
      cycle INTEGER,
      frequency INTEGER,
      notes TEXT,
      payment_method_id INTEGER,
      payer_user_id INTEGER,
      category_id INTEGER,
      notify BOOLEAN DEFAULT false,
      url VARCHAR(255),
      inactive BOOLEAN DEFAULT false,
      notify_days_before INTEGER DEFAULT 0,
      user_id INTEGER DEFAULT 1,
      cancellation_date DATE,
      replacement_subscription_id INTEGER DEFAULT NULL,
      start_date INTEGER DEFAULT NULL,
      auto_renew INTEGER DEFAULT 1
    );
  `)

  db.run(`
    INSERT INTO categories (id, name, "order") VALUES
    (1, 'No category', 1),
    (2, 'VPS', 2),
    (3, 'UnusedTag', 3);

    INSERT INTO currencies (id, name, symbol, code, rate) VALUES
    (1, '人民币', '¥', 'CNY', '1'),
    (2, 'US Dollar', '$', 'USD', '7');

    INSERT INTO cycles (id, days, name) VALUES
    (1, 30, 'Monthly'),
    (2, 365, 'Yearly');

    INSERT INTO frequencies (id, name) VALUES
    (1, 1),
    (2, 2);

    INSERT INTO notification_settings (days) VALUES (3);

    INSERT INTO subscriptions
    (id, name, logo, price, currency_id, next_payment, cycle, frequency, notes, category_id, notify, url, inactive, notify_days_before, start_date, auto_renew)
    VALUES
    (10, 'Test VPS', 'abc.png', 10, 2, '2026-06-01', 1, 1, 'note', 2, 1, 'https://example.com/a', 0, -1, NULL, 1),
    (11, 'No category sub', NULL, 5, 1, '2026-07-01', 2, 1, '', 1, 0, NULL, 0, NULL, NULL, 0);
  `)

  const buffer = Buffer.from(db.export())
  db.close()
  return buffer.toString('base64')
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

  it('only includes used tags and maps each Wallos category to at most one tag', async () => {
    const preview = await previewWallosImportFromBase64ForTest(
      {
        filename: 'wallos.db',
        contentType: 'application/octet-stream',
        base64: await createWallosFixtureBase64()
      },
      {
        defaultNotifyDays: 3,
        baseCurrency: 'CNY'
      }
    )

    expect(preview.isWallos).toBe(true)
    expect(preview.summary.fileType).toBe('db')
    expect(preview.usedTags.map((item) => item.name)).toEqual(['VPS'])
    expect(preview.usedTags[0]?.sourceId).toBe(2)
    expect(preview.summary.usedTagsTotal).toBe(1)

    const uncategorized = preview.subscriptionsPreview.find((item) => item.name === 'No category sub')
    expect(uncategorized?.tagNames).toEqual([])

    const categorized = preview.subscriptionsPreview.find((item) => item.name === 'Test VPS')
    expect(categorized?.tagNames).toEqual(['VPS'])
    expect(categorized?.tagNames).toHaveLength(1)
    expect(categorized?.autoRenew).toBe(true)
  })
})
