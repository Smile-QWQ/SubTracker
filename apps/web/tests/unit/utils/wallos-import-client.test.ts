import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import path from 'node:path'
import initSqlJs from 'sql.js'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildPreparedWallosImportPayload } from '@/utils/wallos-import-client'

const require = createRequire(import.meta.url)

async function createWallosFixtureBuffer() {
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
    (2, 'VPS', 2);

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
    (10, 'Test VPS', 'abc.png', 10, 2, '2025-01-10', 2, 1, 'note', 2, 1, 'example.com', 0, -1, 1736467200, 1),
    (11, 'No category sub', NULL, 5, 1, '2026-07-01', 1, 1, '', 1, 0, NULL, 0, NULL, NULL, 0);
  `)

  const buffer = Buffer.from(db.export())
  db.close()
  return buffer
}

describe('buildPreparedWallosImportPayload', () => {
  it('parses wallos json in browser mode with derived warnings', async () => {
    const file = new File(
      [
        JSON.stringify([
          {
            Name: 'Legacy Auto Renew',
            Price: '$10',
            Category: 'Video',
            'Payment Cycle': 'Yearly',
            'Next Payment': '2025-01-10',
            Renewal: 'Automatic',
            URL: 'netflix.com',
            Notes: ''
          }
        ])
      ],
      'wallos.json',
      { type: 'application/json' }
    )

    const payload = await buildPreparedWallosImportPayload(file, {
      defaultNotifyDays: 3,
      baseCurrency: 'CNY',
      today: '2026-04-25T00:00:00.000Z'
    })

    expect(payload.fileType).toBe('json')
    expect(payload.logoAssets).toEqual([])
    expect(payload.preview.subscriptionsPreview[0]).toMatchObject({
      name: 'Legacy Auto Renew',
      nextRenewalDate: '2027-01-10',
      status: 'active',
      websiteUrl: 'https://netflix.com/',
      currency: 'USD'
    })
    expect(payload.preview.subscriptionsPreview[0]?.warnings).toEqual(
      expect.arrayContaining([
        '价格 "$10" 的币种符号存在歧义，已默认按 USD 导入',
        'Wallos JSON 不包含 start_date，已使用 Next Payment 代填开始日期'
      ])
    )
  })

  it('parses wallos sqlite in browser mode and keeps db-only fields', async () => {
    const file = new File([await createWallosFixtureBuffer()], 'wallos.db', {
      type: 'application/octet-stream'
    })

    const payload = await buildPreparedWallosImportPayload(file, {
      defaultNotifyDays: 3,
      baseCurrency: 'CNY',
      today: '2026-04-25T00:00:00.000Z'
    })

    expect(payload.fileType).toBe('db')
    expect(payload.preview.usedTags.map((item) => item.name)).toEqual(['VPS'])
    expect(payload.preview.subscriptionsPreview.find((item) => item.name === 'Test VPS')).toMatchObject({
      websiteUrl: 'https://example.com/',
      nextRenewalDate: '2027-01-10',
      status: 'active',
      notifyDaysBefore: 3,
      tagNames: ['VPS']
    })
    expect(payload.preview.subscriptionsPreview.find((item) => item.name === 'No category sub')?.tagNames).toEqual([])
  })

  it('parses wallos zip in browser mode and extracts matched logo assets', async () => {
    const dbBuffer = await createWallosFixtureBuffer()
    const zipBuffer = zipSync({
      'backup/db/wallos.db': new Uint8Array(dbBuffer),
      'backup/images/abc.png': Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    })
    const file = new File([zipBuffer], 'wallos-backup.zip', { type: 'application/zip' })

    const payload = await buildPreparedWallosImportPayload(file, {
      defaultNotifyDays: 3,
      baseCurrency: 'CNY',
      today: '2026-04-25T00:00:00.000Z'
    })

    expect(payload.fileType).toBe('zip')
    expect(payload.preview.summary.zipLogoMatched).toBe(1)
    expect(payload.preview.summary.zipLogoMissing).toBe(0)
    expect(payload.preview.subscriptionsPreview.find((item) => item.name === 'Test VPS')).toMatchObject({
      logoImportStatus: 'ready-from-zip',
      logoRef: 'abc.png'
    })
    expect(payload.logoAssets).toHaveLength(1)
    expect(payload.logoAssets[0]).toMatchObject({
      logoRef: 'abc.png',
      filename: 'abc.png',
      contentType: 'image/png'
    })
  })
})
