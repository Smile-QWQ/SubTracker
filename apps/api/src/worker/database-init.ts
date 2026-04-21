import type { D1Database } from './types'

const schemaStatements = [
  `
  CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "icon" TEXT NOT NULL DEFAULT 'apps-outline',
    "sortOrder" INTEGER NOT NULL DEFAULT 0
  )
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_key" ON "Tag"("name")
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
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS "Subscription_status_nextRenewalDate_idx"
  ON "Subscription"("status", "nextRenewalDate")
  `,
  `
  CREATE INDEX IF NOT EXISTS "Subscription_autoRenew_nextRenewalDate_idx"
  ON "Subscription"("autoRenew", "nextRenewalDate")
  `,
  `
  CREATE TABLE IF NOT EXISTS "SubscriptionTag" (
    "subscriptionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("subscriptionId", "tagId"),
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS "SubscriptionTag_tagId_idx" ON "SubscriptionTag"("tagId")
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )
  `,
  `
  CREATE INDEX IF NOT EXISTS "PaymentRecord_subscriptionId_paidAt_idx"
  ON "PaymentRecord"("subscriptionId", "paidAt")
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
  )
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeRateSnapshot_baseCurrency_key"
  ON "ExchangeRateSnapshot"("baseCurrency")
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS "WebhookDelivery_eventType_resourceKey_periodKey_key"
  ON "WebhookDelivery"("eventType", "resourceKey", "periodKey")
  `,
  `
  CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_createdAt_idx"
  ON "WebhookDelivery"("status", "createdAt")
  `,
  `
  CREATE TABLE IF NOT EXISTS "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
  `
].map((statement) => statement.trim())

const initializePromises = new WeakMap<D1Database, Promise<void>>()

async function runSchemaStatements(db: D1Database) {
  if (db.batch) {
    await db.batch(schemaStatements.map((statement) => db.prepare(statement)))
    return
  }

  for (const statement of schemaStatements) {
    await db.exec(statement)
  }
}

export function ensureDatabaseInitialized(db: D1Database) {
  const existingPromise = initializePromises.get(db)
  if (existingPromise) {
    return existingPromise
  }

  const initializePromise = runSchemaStatements(db).catch((error) => {
    initializePromises.delete(db)
    throw error
  })

  initializePromises.set(db, initializePromise)
  return initializePromise
}
