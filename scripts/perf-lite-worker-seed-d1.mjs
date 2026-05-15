import { spawn } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULTS,
  PERF_ROOT,
  ensurePerfDirs,
  fixtureLabel,
  fixturePath,
  nowStamp,
  parseArgs,
  readJson,
  toInt
} from './perf-lite-common.mjs'

const RESET_TABLES = [
  'NotificationDelivery',
  'WebhookDelivery',
  'ImportPreview',
  'ComputedCache',
  'PaymentRecord',
  'SubscriptionTag',
  'Subscription',
  'Tag',
  'ExchangeRateSnapshot',
  'Setting'
]

const ENSURE_TABLE_STATEMENTS = [
  `
  CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "icon" TEXT NOT NULL DEFAULT 'apps-outline',
    "sortOrder" INTEGER NOT NULL DEFAULT 0
  );
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_key" ON "Tag"("name");
  `,
  `
  CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "websiteUrl" TEXT,
    "logoUrl" TEXT,
    "logoSource" TEXT,
    "logoFetchedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "billingIntervalCount" INTEGER NOT NULL DEFAULT 1,
    "billingIntervalUnit" TEXT NOT NULL,
    "autoRenew" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "nextRenewalDate" DATETIME NOT NULL,
    "notifyDaysBefore" INTEGER NOT NULL DEFAULT 3,
    "advanceReminderRules" TEXT,
    "overdueReminderRules" TEXT,
    "webhookEnabled" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS "Subscription_status_nextRenewalDate_idx"
  ON "Subscription"("status", "nextRenewalDate");
  `,
  `
  CREATE INDEX IF NOT EXISTS "Subscription_autoRenew_nextRenewalDate_idx"
  ON "Subscription"("autoRenew", "nextRenewalDate");
  `,
  `
  CREATE TABLE IF NOT EXISTS "SubscriptionTag" (
    "subscriptionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("subscriptionId", "tagId")
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS "SubscriptionTag_tagId_idx" ON "SubscriptionTag"("tagId");
  `,
  `
  CREATE TABLE IF NOT EXISTS "PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "convertedAmount" REAL NOT NULL,
    "exchangeRate" REAL NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS "PaymentRecord_subscriptionId_paidAt_idx"
  ON "PaymentRecord"("subscriptionId", "paidAt");
  `,
  `
  CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriptionId" TEXT,
    "eventType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "targetUrl" TEXT,
    "requestMethod" TEXT,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responseCode" INTEGER,
    "responseBody" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS "WebhookDelivery_eventType_resourceKey_periodKey_key"
  ON "WebhookDelivery"("eventType", "resourceKey", "periodKey");
  `,
  `
  CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_createdAt_idx"
  ON "WebhookDelivery"("status", "createdAt");
  `,
  `
  CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_channel_eventType_resourceKey_periodKey_key"
  ON "NotificationDelivery"("channel", "eventType", "resourceKey", "periodKey");
  `,
  `
  CREATE TABLE IF NOT EXISTS "ImportPreview" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "previewJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS "ImportPreview_expiresAt_idx" ON "ImportPreview"("expiresAt");
  `,
  `
  CREATE TABLE IF NOT EXISTS "ComputedCache" (
    "namespace" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("namespace", "cacheKey")
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS "ComputedCache_namespace_expiresAt_idx"
  ON "ComputedCache"("namespace", "expiresAt");
  `,
  `
  CREATE TABLE IF NOT EXISTS "ExchangeRateSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "baseCurrency" TEXT NOT NULL,
    "ratesJson" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "isStale" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeRateSnapshot_baseCurrency_key"
  ON "ExchangeRateSnapshot"("baseCurrency");
  `,
  `
  CREATE TABLE IF NOT EXISTS "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `
].map((statement) => statement.trim())

function quoteSqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function quoteSqlJson(value) {
  return quoteSqlText(JSON.stringify(value))
}

function quoteSqlBoolean(value) {
  return value ? '1' : '0'
}

function createAuthCredentials() {
  const passwordSalt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync('admin', passwordSalt, 64).toString('hex')
  return {
    username: 'admin',
    passwordHash,
    passwordSalt
  }
}

function buildSeedStatements(fixture) {
  const statements = [...ENSURE_TABLE_STATEMENTS, 'PRAGMA foreign_keys = OFF;', 'BEGIN TRANSACTION;']

  for (const table of RESET_TABLES) {
    statements.push(`DELETE FROM "${table}";`)
  }

  for (const [key, value] of Object.entries(fixture.dataset.settings)) {
    statements.push(
      `INSERT INTO "Setting" ("key", "valueJson", "updatedAt") VALUES (${quoteSqlText(key)}, ${quoteSqlJson(value)}, CURRENT_TIMESTAMP);`
    )
  }

  statements.push(
    `INSERT INTO "Setting" ("key", "valueJson", "updatedAt") VALUES (${quoteSqlText('authCredentials')}, ${quoteSqlJson(createAuthCredentials())}, CURRENT_TIMESTAMP);`
  )
  statements.push(
    `INSERT INTO "Setting" ("key", "valueJson", "updatedAt") VALUES (${quoteSqlText('notificationWebhook')}, ${quoteSqlJson(
      fixture.dataset.manifest.data.notificationWebhook
    )}, CURRENT_TIMESTAMP);`
  )

  statements.push(
    `INSERT INTO "ExchangeRateSnapshot" ("id", "baseCurrency", "ratesJson", "provider", "fetchedAt", "isStale", "updatedAt")
     VALUES (${quoteSqlText('perf_rates_1')}, ${quoteSqlText('CNY')}, ${quoteSqlJson({
       CNY: 1,
       USD: 7.2,
       EUR: 7.8,
       JPY: 0.05
     })}, ${quoteSqlText('perf-fixture')}, ${quoteSqlText('2026-05-13T00:00:00.000Z')}, 0, CURRENT_TIMESTAMP);`
  )

  for (const tag of fixture.dataset.tags) {
    statements.push(
      `INSERT INTO "Tag" ("id", "name", "color", "icon", "sortOrder")
       VALUES (${quoteSqlText(tag.id)}, ${quoteSqlText(tag.name)}, ${quoteSqlText(tag.color)}, ${quoteSqlText(tag.icon)}, ${Number(tag.sortOrder)});`
    )
  }

  for (const subscription of fixture.dataset.subscriptions) {
    statements.push(
      `INSERT INTO "Subscription" (
        "id", "name", "description", "websiteUrl", "logoUrl", "logoSource", "logoFetchedAt",
        "status", "amount", "currency", "billingIntervalCount", "billingIntervalUnit",
        "autoRenew", "startDate", "nextRenewalDate", "notifyDaysBefore",
        "advanceReminderRules", "overdueReminderRules", "webhookEnabled", "notes",
        "createdAt", "updatedAt"
      ) VALUES (
        ${quoteSqlText(subscription.id)},
        ${quoteSqlText(subscription.name)},
        ${quoteSqlText(subscription.description)},
        ${subscription.websiteUrl ? quoteSqlText(subscription.websiteUrl) : 'NULL'},
        NULL,
        NULL,
        NULL,
        ${quoteSqlText(subscription.status)},
        ${Number(subscription.amount)},
        ${quoteSqlText(subscription.currency)},
        ${Number(subscription.billingIntervalCount)},
        ${quoteSqlText(subscription.billingIntervalUnit)},
        ${quoteSqlBoolean(subscription.autoRenew)},
        ${quoteSqlText(`${subscription.startDate}T00:00:00.000Z`)},
        ${quoteSqlText(`${subscription.nextRenewalDate}T00:00:00.000Z`)},
        ${Number(subscription.notifyDaysBefore)},
        ${subscription.advanceReminderRules ? quoteSqlText(subscription.advanceReminderRules) : 'NULL'},
        ${subscription.overdueReminderRules ? quoteSqlText(subscription.overdueReminderRules) : 'NULL'},
        ${quoteSqlBoolean(subscription.webhookEnabled)},
        ${quoteSqlText(subscription.notes)},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );`
    )
  }

  for (const subscription of fixture.dataset.subscriptions) {
    for (const tagId of subscription.tagIds) {
      statements.push(
        `INSERT INTO "SubscriptionTag" ("subscriptionId", "tagId") VALUES (${quoteSqlText(subscription.id)}, ${quoteSqlText(tagId)});`
      )
    }
  }

  for (const record of fixture.dataset.paymentRecords) {
    statements.push(
      `INSERT INTO "PaymentRecord" (
        "id", "subscriptionId", "amount", "currency", "baseCurrency", "convertedAmount",
        "exchangeRate", "paidAt", "periodStart", "periodEnd", "createdAt"
      ) VALUES (
        ${quoteSqlText(record.id)},
        ${quoteSqlText(record.subscriptionId)},
        ${Number(record.amount)},
        ${quoteSqlText(record.currency)},
        ${quoteSqlText(record.baseCurrency)},
        ${Number(record.convertedAmount)},
        ${Number(record.exchangeRate)},
        ${quoteSqlText(record.paidAt)},
        ${quoteSqlText(record.periodStart)},
        ${quoteSqlText(record.periodEnd)},
        ${quoteSqlText(record.createdAt)}
      );`
    )
  }

  statements.push('COMMIT;', 'PRAGMA foreign_keys = ON;')
  return statements.join('\n')
}

async function ensureWorkerSchema(baseUrl) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login-options`)
  if (!response.ok) {
    throw new Error(`Worker bootstrap failed with status ${response.status}`)
  }
}

function runWranglerD1(sqlFilePath, persistTo) {
  const baseArgs = ['wrangler', 'd1', 'execute', 'DB', '--local', '--file', sqlFilePath]
  if (persistTo) {
    baseArgs.push('--persist-to', persistTo)
  }

  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', 'npx', ...baseArgs], {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: false
          })
        : spawn('npx', baseArgs, {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: false
          })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`wrangler d1 execute exited with code ${code ?? 1}`))
    })
  })
}

async function main() {
  const args = parseArgs()
  const baseUrl = String(args['base-url'] ?? 'http://127.0.0.1:8787')
  const persistTo = typeof args['persist-to'] === 'string' ? String(args['persist-to']) : null
  const meta = {
    subscriptions: toInt(args.subscriptions, DEFAULTS.subscriptions),
    tags: toInt(args.tags, DEFAULTS.tags),
    paymentsPerSubscription: toInt(args['payments-per-subscription'], DEFAULTS.paymentsPerSubscription),
    mode: String(args.mode ?? DEFAULTS.mode),
    channelMode: String(args['channel-mode'] ?? DEFAULTS.channelMode)
  }

  await ensurePerfDirs()
  const fixture = await readJson(fixturePath(meta))
  await ensureWorkerSchema(baseUrl)

  const sqlPath = path.join(PERF_ROOT, `${fixtureLabel(meta)}-worker-seed-${nowStamp()}.sql`)
  await writeFile(sqlPath, `${buildSeedStatements(fixture)}\n`, 'utf8')
  await runWranglerD1(sqlPath, persistTo)

  console.log(
    JSON.stringify({
      ok: true,
      fixture: fixtureLabel(meta),
      sqlPath,
      persistTo,
      rows: {
        subscriptions: fixture.dataset.subscriptions.length,
        tags: fixture.dataset.tags.length,
        paymentRecords: fixture.dataset.paymentRecords.length
      }
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
