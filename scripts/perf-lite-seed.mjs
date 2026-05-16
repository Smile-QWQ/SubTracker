import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import {
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  DEFAULT_RESEND_API_URL
} from '@subtracker/shared'
import {
  DEFAULTS,
  ensurePerfDirs,
  fixtureLabel,
  fixturePath,
  parseArgs,
  readJson,
  toInt,
  writeJson
} from './perf-lite-common.mjs'

const prisma = new PrismaClient()

function buildSettings() {
  return {
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    defaultNotifyDays: 3,
    defaultAdvanceReminderRules: DEFAULT_ADVANCE_REMINDER_RULES,
    rememberSessionDays: 7,
    forgotPasswordEnabled: false,
    notifyOnDueDay: true,
    mergeMultiSubscriptionNotifications: true,
    monthlyBudgetBase: null,
    yearlyBudgetBase: null,
    overdueReminderDays: [1, 2, 3],
    defaultOverdueReminderRules: DEFAULT_OVERDUE_REMINDER_RULES,
    emailNotificationsEnabled: false,
    emailProvider: 'resend',
    pushplusNotificationsEnabled: false,
    telegramNotificationsEnabled: false,
    serverchanNotificationsEnabled: false,
    gotifyNotificationsEnabled: false,
    smtpConfig: {
      host: '',
      port: 587,
      secure: false,
      username: '',
      password: '',
      from: '',
      to: ''
    },
    resendConfig: {
      apiBaseUrl: DEFAULT_RESEND_API_URL,
      apiKey: '',
      from: '',
      to: ''
    },
    pushplusConfig: {
      token: '',
      topic: ''
    },
    telegramConfig: {
      botToken: '',
      chatId: ''
    },
    serverchanConfig: {
      sendkey: ''
    },
    gotifyConfig: {
      url: '',
      token: '',
      ignoreSsl: false
    },
    aiConfig: {
      enabled: false,
      dashboardSummaryEnabled: false,
      providerPreset: 'custom',
      providerName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      timeoutMs: 30000,
      promptTemplate: '',
      dashboardSummaryPromptTemplate: '',
      capabilities: {
        vision: false,
        structuredOutput: true
      }
    },
    storageCapabilities: {
      runtime: 'worker-lite',
      r2Enabled: false,
      logoStorageEnabled: false,
      wallosImportMode: 'json-db-zip'
    }
  }
}

function buildWebhookSettings(channelMode) {
  if (channelMode === 'webhook') {
    return {
      enabled: true,
      url: 'https://example.invalid/webhook',
      requestMethod: 'POST',
      headers: 'Content-Type: application/json',
      payloadTemplate: '{}',
      ignoreSsl: false
    }
  }

  return {
    enabled: false,
    url: '',
    requestMethod: 'POST',
    headers: 'Content-Type: application/json',
    payloadTemplate: '{}',
    ignoreSsl: false
  }
}

function pickModeDefaults(mode) {
  switch (mode) {
    case 'dashboard-heavy':
      return {
        webhookEnabled: false,
        advanceReminderRules: DEFAULT_ADVANCE_REMINDER_RULES
      }
    case 'cron-heavy':
      return {
        webhookEnabled: true,
        advanceReminderRules: '14&09:30;7&09:30;3&09:30;1&09:30;0&09:30;',
        overdueReminderRules: '1&09:30;2&09:30;3&09:30;7&09:30;'
      }
    case 'import-heavy':
      return {
        webhookEnabled: false,
        advanceReminderRules: DEFAULT_ADVANCE_REMINDER_RULES
      }
    case 'mixed':
    default:
      return {
        webhookEnabled: false,
        advanceReminderRules: DEFAULT_ADVANCE_REMINDER_RULES
      }
  }
}

function buildFixture(meta) {
  const currencies = ['CNY', 'USD', 'EUR', 'JPY']
  const modeDefaults = pickModeDefaults(meta.mode)
  const settings = buildSettings()
  if (meta.channelMode === 'email') {
    settings.emailNotificationsEnabled = true
    settings.resendConfig = {
      ...settings.resendConfig,
      apiKey: 'perf-test-key',
      from: 'perf@example.com',
      to: 'dest@example.com'
    }
  }

  const tags = Array.from({ length: meta.tags }, (_, index) => ({
    id: `perf_tag_${index + 1}`,
    name: `Perf Tag ${index + 1}`,
    color: `#${(0x334455 + index * 131).toString(16).slice(0, 6).padStart(6, '0')}`,
    icon: 'apps-outline',
    sortOrder: index + 1
  }))

  const subscriptions = Array.from({ length: meta.subscriptions }, (_, index) => {
    const cycle = index % 4
    const intervalUnit = ['month', 'year', 'quarter', 'month'][cycle]
    const status = meta.mode === 'cron-heavy'
      ? index % 5 === 0
        ? 'expired'
        : 'active'
      : index % 8 === 0
        ? 'paused'
        : index % 11 === 0
          ? 'cancelled'
          : 'active'
    const dayOffset =
      meta.mode === 'dashboard-heavy'
        ? (index % 90) + 1
        : meta.mode === 'cron-heavy'
          ? (index % 20) - 5
          : (index % 45) + 1
    const nextRenewalDate = new Date(Date.UTC(2026, 4, 1 + dayOffset, 0, 0, 0))
    const tagCount =
      meta.mode === 'dashboard-heavy'
        ? 3 + (index % 3)
        : meta.mode === 'mixed'
          ? 1 + (index % 2)
          : 1
    const tagIds = Array.from({ length: tagCount }, (_, tagIndex) => tags[(index + tagIndex) % tags.length]?.id).filter(Boolean)
    const createdAt = new Date(Date.UTC(2025, 0, 1 + index, 8, index % 60, 0))
    const updatedAt = new Date(createdAt)
    updatedAt.setUTCDate(updatedAt.getUTCDate() + Math.max(dayOffset, 0))

    return {
      id: `perf_sub_${index + 1}`,
      name: `Perf Subscription ${index + 1}`,
      description: `${meta.mode} fixture subscription ${index + 1}`,
      websiteUrl: `https://perf-${index + 1}.example.com`,
      logoUrl: null,
      logoSource: null,
      logoFetchedAt: null,
      status,
      amount: 8 + (index % 12) * 3,
      currency: currencies[index % currencies.length],
      billingIntervalCount: intervalUnit === 'year' ? 1 : intervalUnit === 'quarter' ? 1 : 1,
      billingIntervalUnit: intervalUnit,
      autoRenew: index % 3 !== 0,
      startDate: '2026-01-01',
      nextRenewalDate: nextRenewalDate.toISOString().slice(0, 10),
      notifyDaysBefore: meta.mode === 'cron-heavy' ? 7 : 3,
      advanceReminderRules: modeDefaults.advanceReminderRules,
      overdueReminderRules: modeDefaults.overdueReminderRules ?? DEFAULT_OVERDUE_REMINDER_RULES,
      webhookEnabled: modeDefaults.webhookEnabled,
      notes: `${meta.mode}-notes-${index + 1}`,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      tagIds
    }
  })

  const paymentRecords = subscriptions.flatMap((subscription, subscriptionIndex) =>
    Array.from({ length: meta.paymentsPerSubscription }, (_, paymentIndex) => {
      const baseDate = new Date(Date.UTC(2025, 11, 1))
      baseDate.setUTCDate(baseDate.getUTCDate() + subscriptionIndex + paymentIndex * 30)
      const periodEnd = new Date(baseDate)
      periodEnd.setUTCDate(periodEnd.getUTCDate() + 29)
      return {
        id: `perf_pay_${subscriptionIndex + 1}_${paymentIndex + 1}`,
        subscriptionId: subscription.id,
        amount: subscription.amount,
        currency: subscription.currency,
        baseCurrency: 'CNY',
        convertedAmount: subscription.currency === 'CNY' ? subscription.amount : Number((subscription.amount * 7.2).toFixed(2)),
        exchangeRate: subscription.currency === 'CNY' ? 1 : 7.2,
        paidAt: baseDate.toISOString(),
        periodStart: baseDate.toISOString(),
        periodEnd: periodEnd.toISOString(),
        createdAt: baseDate.toISOString()
      }
    })
  )

  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date('2026-05-13T00:00:00.000Z').toISOString(),
    app: 'SubTracker',
    scope: 'business-complete',
    data: {
      settings,
      notificationWebhook: buildWebhookSettings(meta.channelMode),
      tags,
      subscriptions,
      paymentRecords,
      subscriptionOrder: subscriptions.map((item) => item.id)
    },
    assets: {
      logos: []
    }
  }

  const wallosPreparedPayload = {
    fileType: 'zip',
    preview: {
      isWallos: true,
      summary: {
        fileType: 'zip',
        subscriptionsTotal: Math.min(subscriptions.length, 50),
        tagsTotal: Math.min(tags.length, 10),
        usedTagsTotal: Math.min(tags.length, 10),
        supportedSubscriptions: Math.min(subscriptions.length, 50),
        skippedSubscriptions: 0,
        globalNotifyDays: 3,
        zipLogoMatched: 0,
        zipLogoMissing: 0
      },
      tags: tags.slice(0, 10).map((tag, index) => ({
        sourceId: index + 1,
        name: tag.name,
        sortOrder: tag.sortOrder
      })),
      usedTags: tags.slice(0, 10).map((tag, index) => ({
        sourceId: index + 1,
        name: tag.name,
        sortOrder: tag.sortOrder
      })),
      subscriptionsPreview: subscriptions.slice(0, 50).map((subscription, index) => ({
        sourceId: index + 1,
        name: subscription.name,
        amount: subscription.amount,
        currency: subscription.currency,
        status: subscription.status,
        autoRenew: subscription.autoRenew,
        billingIntervalCount: subscription.billingIntervalCount,
        billingIntervalUnit: subscription.billingIntervalUnit,
        startDate: subscription.startDate,
        nextRenewalDate: subscription.nextRenewalDate,
        notifyDaysBefore: subscription.notifyDaysBefore,
        webhookEnabled: subscription.webhookEnabled,
        notes: subscription.notes,
        description: subscription.description,
        websiteUrl: subscription.websiteUrl,
        tagNames: subscription.tagIds
          .map((tagId) => tags.find((tag) => tag.id === tagId)?.name)
          .filter(Boolean),
        logoRef: null,
        logoImportStatus: 'none',
        warnings: []
      })),
      warnings: []
    },
    logoAssets: []
  }

  return {
    meta,
    dataset: {
      settings,
      tags,
      subscriptions,
      paymentRecords,
      manifest,
      logoAssets: [],
      wallosPreparedPayload
    }
  }
}

async function applyFixtureToDb(fixture) {
  const passwordSalt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync('admin', passwordSalt, 64).toString('hex')

  await prisma.webhookDelivery.deleteMany()
  await prisma.paymentRecord.deleteMany()
  await prisma.subscriptionTag.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.exchangeRateSnapshot.deleteMany()
  await prisma.setting.deleteMany()

  await prisma.setting.createMany({
    data: Object.entries(fixture.dataset.settings).map(([key, value]) => ({
      key,
      valueJson: value
    }))
  })

  await prisma.setting.upsert({
    where: { key: 'authCredentials' },
    update: {
      valueJson: {
        username: 'admin',
        passwordHash,
        passwordSalt,
        algorithm: 'scrypt',
        mustChangePassword: true
      }
    },
    create: {
      key: 'authCredentials',
      valueJson: {
        username: 'admin',
        passwordHash,
        passwordSalt,
        algorithm: 'scrypt',
        mustChangePassword: true
      }
    }
  })

  await prisma.setting.upsert({
    where: { key: 'notificationWebhook' },
    update: {
      valueJson: fixture.dataset.manifest.data.notificationWebhook
    },
    create: {
      key: 'notificationWebhook',
      valueJson: fixture.dataset.manifest.data.notificationWebhook
    }
  })

  await prisma.exchangeRateSnapshot.create({
    data: {
      id: randomUUID(),
      baseCurrency: 'CNY',
      ratesJson: {
        CNY: 1,
        USD: 7.2,
        EUR: 7.8,
        JPY: 0.05
      },
      provider: 'perf-fixture',
      fetchedAt: new Date('2026-05-13T00:00:00.000Z'),
      isStale: false
    }
  })

  if (fixture.dataset.tags.length) {
    await prisma.tag.createMany({
      data: fixture.dataset.tags
    })
  }

  for (const subscription of fixture.dataset.subscriptions) {
    await prisma.subscription.create({
      data: {
        id: subscription.id,
        name: subscription.name,
        description: subscription.description,
        websiteUrl: subscription.websiteUrl,
        logoUrl: null,
        logoSource: null,
        logoFetchedAt: null,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        billingIntervalCount: subscription.billingIntervalCount,
        billingIntervalUnit: subscription.billingIntervalUnit,
        autoRenew: subscription.autoRenew,
        startDate: new Date(`${subscription.startDate}T00:00:00.000Z`),
        nextRenewalDate: new Date(`${subscription.nextRenewalDate}T00:00:00.000Z`),
        notifyDaysBefore: subscription.notifyDaysBefore,
        advanceReminderRules: subscription.advanceReminderRules,
        overdueReminderRules: subscription.overdueReminderRules,
        webhookEnabled: subscription.webhookEnabled,
        notes: subscription.notes,
        createdAt: new Date(subscription.createdAt),
        updatedAt: new Date(subscription.updatedAt)
      }
    })
  }

  const subscriptionTags = fixture.dataset.subscriptions.flatMap((subscription) =>
    subscription.tagIds.map((tagId) => ({
      subscriptionId: subscription.id,
      tagId
    }))
  )

  if (subscriptionTags.length) {
    await prisma.subscriptionTag.createMany({
      data: subscriptionTags
    })
  }

  if (fixture.dataset.paymentRecords.length) {
    await prisma.paymentRecord.createMany({
      data: fixture.dataset.paymentRecords.map((record) => ({
        ...record,
        paidAt: new Date(record.paidAt),
        periodStart: new Date(record.periodStart),
        periodEnd: new Date(record.periodEnd),
        createdAt: new Date(record.createdAt)
      }))
    })
  }
}

async function main() {
  const args = parseArgs()
  const meta = {
    subscriptions: toInt(args.subscriptions, DEFAULTS.subscriptions),
    tags: toInt(args.tags, DEFAULTS.tags),
    paymentsPerSubscription: toInt(args['payments-per-subscription'], DEFAULTS.paymentsPerSubscription),
    mode: String(args.mode ?? DEFAULTS.mode),
    channelMode: String(args['channel-mode'] ?? DEFAULTS.channelMode)
  }

  await ensurePerfDirs()
  const fixture = buildFixture(meta)
  await writeJson(fixturePath(meta), fixture)
  await applyFixtureToDb(fixture)

  const saved = await readJson(fixturePath(meta))
  console.log(
    JSON.stringify({
      ok: true,
      fixture: fixtureLabel(meta),
      file: fixturePath(meta),
      rows: {
        subscriptions: saved.dataset.subscriptions.length,
        tags: saved.dataset.tags.length,
        paymentRecords: saved.dataset.paymentRecords.length
      }
    })
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
