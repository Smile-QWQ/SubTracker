import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prismaMock: {
    tag: {
      findMany: vi.fn(),
      create: vi.fn()
    },
    subscription: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn()
    },
    paymentRecord: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn()
    },
    subscriptionTag: {
      createMany: vi.fn(),
      deleteMany: vi.fn()
    },
    setting: {
      deleteMany: vi.fn()
    }
  },
  getAppSettingsMock: vi.fn(),
  getPrimaryWebhookEndpointMock: vi.fn(),
  getSubscriptionOrderMock: vi.fn(),
  setSubscriptionOrderMock: vi.fn(),
  setSettingMock: vi.fn(),
  saveImportedLogoBufferToKeyMock: vi.fn(),
  getLocalLogoLibraryMock: vi.fn(),
  getWorkerLogoBucketMock: vi.fn(),
  getWorkerPublicConfigMock: vi.fn(),
  deleteLogoStorageObjectMock: vi.fn(),
  extractLogoStorageKeyMock: vi.fn()
}))

vi.mock('../../src/db', () => ({
  prisma: mocks.prismaMock
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: mocks.getAppSettingsMock,
  setSetting: mocks.setSettingMock
}))

vi.mock('../../src/services/webhook.service', () => ({
  getPrimaryWebhookEndpoint: mocks.getPrimaryWebhookEndpointMock
}))

vi.mock('../../src/services/subscription-order.service', () => ({
  getSubscriptionOrder: mocks.getSubscriptionOrderMock,
  setSubscriptionOrder: mocks.setSubscriptionOrderMock
}))

vi.mock('../../src/services/logo.service', () => ({
  getLocalLogoLibrary: mocks.getLocalLogoLibraryMock,
  saveImportedLogoBufferToKey: mocks.saveImportedLogoBufferToKeyMock,
  deleteLogoStorageObject: mocks.deleteLogoStorageObjectMock,
  extractLogoStorageKey: mocks.extractLogoStorageKeyMock
}))

vi.mock('../../src/runtime', () => ({
  getWorkerLogoBucket: mocks.getWorkerLogoBucketMock,
  getWorkerPublicConfig: mocks.getWorkerPublicConfigMock,
  isWorkerRuntime: vi.fn(() => true)
}))

import { commitSubtrackerBackup, createSubtrackerBackupArchive, inspectSubtrackerBackupFile } from '../../src/services/subtracker-backup.service'

describe('subtracker backup service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T08:00:00.000Z'))
    mocks.prismaMock.tag.findMany.mockReset()
    mocks.prismaMock.subscription.findMany.mockReset()
    mocks.prismaMock.subscription.create.mockReset()
    mocks.prismaMock.subscription.deleteMany.mockReset()
    mocks.prismaMock.paymentRecord.findMany.mockReset()
    mocks.prismaMock.paymentRecord.create.mockReset()
    mocks.prismaMock.paymentRecord.deleteMany.mockReset()
    mocks.prismaMock.subscriptionTag.createMany.mockReset()
    mocks.prismaMock.subscriptionTag.deleteMany.mockReset()
    mocks.prismaMock.setting.deleteMany.mockReset()
    mocks.getAppSettingsMock.mockReset()
    mocks.getPrimaryWebhookEndpointMock.mockReset()
    mocks.getSubscriptionOrderMock.mockReset()
    mocks.setSubscriptionOrderMock.mockReset()
    mocks.setSettingMock.mockReset()
    mocks.saveImportedLogoBufferToKeyMock.mockReset()
    mocks.getLocalLogoLibraryMock.mockReset()
    mocks.getWorkerLogoBucketMock.mockReset()
    mocks.getWorkerPublicConfigMock.mockReset()
    mocks.deleteLogoStorageObjectMock.mockReset()
    mocks.extractLogoStorageKeyMock.mockReset()
  })

  it('exports a zip archive with manifest and referenced logos', async () => {
    mocks.getAppSettingsMock.mockResolvedValue({
      baseCurrency: 'CNY',
      timezone: 'Asia/Shanghai',
      defaultNotifyDays: 3,
      defaultAdvanceReminderRules: '3&09:30;0&09:30;',
      rememberSessionDays: 7,
      notifyOnDueDay: true,
      mergeMultiSubscriptionNotifications: true,
      monthlyBudgetBase: null,
      yearlyBudgetBase: null,
      enableTagBudgets: false,
      overdueReminderDays: [1, 2, 3],
      defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
      tagBudgets: {},
      emailNotificationsEnabled: false,
      emailProvider: 'resend',
      pushplusNotificationsEnabled: false,
      telegramNotificationsEnabled: false,
      serverchanNotificationsEnabled: false,
      gotifyNotificationsEnabled: false,
      smtpConfig: { host: '', port: 587, secure: false, username: '', password: '', from: '', to: '' },
      resendConfig: { apiBaseUrl: 'https://api.resend.com/emails', apiKey: '', from: '', to: '' },
      pushplusConfig: { token: '', topic: '' },
      telegramConfig: { botToken: '', chatId: '' },
      serverchanConfig: { sendkey: '' },
      gotifyConfig: { url: '', token: '', ignoreSsl: false },
      aiConfig: {
        enabled: false,
        providerPreset: 'custom',
        providerName: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        apiKey: '',
        model: 'deepseek-chat',
        timeoutMs: 30000,
        promptTemplate: '',
        capabilities: { vision: false, structuredOutput: true }
      },
      storageCapabilities: {
        runtime: 'worker-lite',
        r2Enabled: true,
        logoStorageEnabled: true,
        wallosImportMode: 'json-db-zip'
      }
    })
    mocks.getPrimaryWebhookEndpointMock.mockResolvedValue({
      enabled: true,
      url: 'https://example.com/hook',
      requestMethod: 'POST',
      headers: 'Content-Type: application/json',
      payloadTemplate: '{}',
      ignoreSsl: false
    })
    mocks.getSubscriptionOrderMock.mockResolvedValue(['sub_1'])
    mocks.prismaMock.tag.findMany.mockResolvedValue([
      { id: 'tag_1', name: '影音', color: '#3b82f6', icon: 'apps-outline', sortOrder: 1 }
    ])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([
      {
        id: 'sub_1',
        name: 'Netflix',
        description: 'Streaming',
        websiteUrl: 'https://netflix.com',
        logoUrl: '/static/logos/netflix.png',
        logoSource: 'upload',
        logoFetchedAt: '2026-04-01T00:00:00.000Z',
        status: 'active',
        amount: 15,
        currency: 'USD',
        billingIntervalCount: 1,
        billingIntervalUnit: 'month',
        autoRenew: true,
        startDate: new Date('2026-04-01T00:00:00.000Z'),
        nextRenewalDate: new Date('2026-05-01T00:00:00.000Z'),
        notifyDaysBefore: 3,
        advanceReminderRules: '3&09:30;0&09:30;',
        overdueReminderRules: '1&09:30;',
        webhookEnabled: true,
        notes: '',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        tags: [{ tagId: 'tag_1' }]
      }
    ])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([
      {
        id: 'pay_1',
        subscriptionId: 'sub_1',
        amount: 15,
        currency: 'USD',
        baseCurrency: 'CNY',
        convertedAmount: 108,
        exchangeRate: 7.2,
        paidAt: new Date('2026-04-01T00:00:00.000Z'),
        periodStart: new Date('2026-04-01T00:00:00.000Z'),
        periodEnd: new Date('2026-04-30T00:00:00.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z')
      }
    ])
    mocks.getWorkerLogoBucketMock.mockReturnValue({
      get: vi.fn(async () => ({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('fake-image'))
            controller.close()
          }
        })
      }))
    })
    mocks.getLocalLogoLibraryMock.mockResolvedValue([
      { logoUrl: '/static/logos/netflix.png', filename: 'logos/netflix.png' }
    ])
    mocks.extractLogoStorageKeyMock.mockReturnValue('logos/netflix.png')

    const result = await createSubtrackerBackupArchive()

    expect(result.filename).toBe('subtracker-backup-2026-05-02T16-00-00.zip')
    expect(result.contentType).toBe('application/zip')
    const decoded = Buffer.from(result.buffer).toString('binary')
    expect(decoded.length).toBeGreaterThan(0)
  })

  it('inspects a valid backup zip without storing preview state', async () => {
    const manifest = {
      schemaVersion: 1,
      exportedAt: '2026-05-02T08:00:00.000Z',
      app: 'SubTracker',
      scope: 'business-complete',
      data: {
        settings: {
          baseCurrency: 'CNY',
          timezone: 'Asia/Shanghai',
          defaultNotifyDays: 3,
          defaultAdvanceReminderRules: '3&09:30;0&09:30;',
          rememberSessionDays: 7,
          notifyOnDueDay: true,
          mergeMultiSubscriptionNotifications: true,
          monthlyBudgetBase: null,
          yearlyBudgetBase: null,
          enableTagBudgets: false,
          overdueReminderDays: [1, 2, 3],
          defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
          tagBudgets: {},
          emailNotificationsEnabled: false,
          emailProvider: 'resend',
          pushplusNotificationsEnabled: false,
          telegramNotificationsEnabled: false,
          serverchanNotificationsEnabled: false,
          gotifyNotificationsEnabled: false,
          smtpConfig: { host: '', port: 587, secure: false, username: '', password: '', from: '', to: '' },
          resendConfig: { apiBaseUrl: 'https://api.resend.com/emails', apiKey: '', from: '', to: '' },
          pushplusConfig: { token: '', topic: '' },
          telegramConfig: { botToken: '', chatId: '' },
          serverchanConfig: { sendkey: '' },
          gotifyConfig: { url: '', token: '', ignoreSsl: false },
          aiConfig: {
            enabled: false,
            providerPreset: 'custom',
            providerName: 'DeepSeek',
            baseUrl: 'https://api.deepseek.com',
            apiKey: '',
            model: 'deepseek-chat',
            timeoutMs: 30000,
            promptTemplate: '',
            capabilities: { vision: false, structuredOutput: true }
          }
        },
        notificationWebhook: {
          enabled: false,
          url: '',
          requestMethod: 'POST',
          headers: 'Content-Type: application/json',
          payloadTemplate: '{}',
          ignoreSsl: false
        },
        tags: [{ id: 'tag_1', name: '影音', color: '#3b82f6', icon: 'apps-outline', sortOrder: 1 }],
        subscriptions: [
          {
            id: 'sub_1',
            name: 'Netflix',
            description: '',
            websiteUrl: 'https://netflix.com',
            logoUrl: '/static/logos/netflix.png',
            logoSource: 'upload',
            logoFetchedAt: null,
            status: 'active',
            amount: 15,
            currency: 'USD',
            billingIntervalCount: 1,
            billingIntervalUnit: 'month',
            autoRenew: true,
            startDate: '2026-04-01',
            nextRenewalDate: '2026-05-01',
            notifyDaysBefore: 3,
            advanceReminderRules: '3&09:30;0&09:30;',
            overdueReminderRules: '1&09:30;',
            webhookEnabled: true,
            notes: '',
            tagIds: ['tag_1'],
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z'
          }
        ],
        paymentRecords: [],
        subscriptionOrder: ['sub_1']
      },
      assets: {
        logos: [
          {
            path: 'logos/netflix.png',
            filename: 'netflix.png',
            sourceLogoUrl: '/static/logos/netflix.png',
            contentType: 'image/png',
            referencedBySubscriptionIds: ['sub_1']
          }
        ]
      }
    }

    mocks.prismaMock.tag.findMany.mockResolvedValue([{ name: '影音' }])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([{ id: 'sub_1' }])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([])
    mocks.getWorkerLogoBucketMock.mockReturnValue(null)

    const preview = await inspectSubtrackerBackupFile({
      filename: 'backup.zip',
      manifest,
      logoAssets: [
        {
          path: 'logos/netflix.png',
          filename: 'netflix.png',
          contentType: 'image/png',
          base64: Buffer.from('fake-image').toString('base64')
        }
      ]
    })

    expect(preview.isSubtrackerBackup).toBe(true)
    expect(preview.availableModes).toEqual(['replace', 'append'])
    expect(preview.conflicts).toMatchObject({
      existingTagNameCount: 1,
      existingSubscriptionIdCount: 1
    })
    expect(preview).not.toHaveProperty('importToken')
  })

  it('commits a valid backup with direct manifest payload', async () => {
    const manifest = {
      schemaVersion: 1,
      exportedAt: '2026-05-02T08:00:00.000Z',
      app: 'SubTracker',
      scope: 'business-complete',
      data: {
        settings: {
          baseCurrency: 'CNY',
          timezone: 'Asia/Shanghai',
          defaultNotifyDays: 3,
          defaultAdvanceReminderRules: '3&09:30;0&09:30;',
          rememberSessionDays: 7,
          notifyOnDueDay: true,
          mergeMultiSubscriptionNotifications: true,
          monthlyBudgetBase: null,
          yearlyBudgetBase: null,
          enableTagBudgets: false,
          overdueReminderDays: [1, 2, 3],
          defaultOverdueReminderRules: '1&09:30;2&09:30;3&09:30;',
          tagBudgets: {},
          emailNotificationsEnabled: false,
          emailProvider: 'resend',
          pushplusNotificationsEnabled: false,
          telegramNotificationsEnabled: false,
          serverchanNotificationsEnabled: false,
          gotifyNotificationsEnabled: false,
          smtpConfig: { host: '', port: 587, secure: false, username: '', password: '', from: '', to: '' },
          resendConfig: { apiBaseUrl: 'https://api.resend.com/emails', apiKey: '', from: '', to: '' },
          pushplusConfig: { token: '', topic: '' },
          telegramConfig: { botToken: '', chatId: '' },
          serverchanConfig: { sendkey: '' },
          gotifyConfig: { url: '', token: '', ignoreSsl: false },
          aiConfig: {
            enabled: false,
            providerPreset: 'custom',
            providerName: 'DeepSeek',
            baseUrl: 'https://api.deepseek.com',
            apiKey: '',
            model: 'deepseek-chat',
            timeoutMs: 30000,
            promptTemplate: '',
            capabilities: { vision: false, structuredOutput: true }
          }
        },
        notificationWebhook: {
          enabled: false,
          url: '',
          requestMethod: 'POST',
          headers: 'Content-Type: application/json',
          payloadTemplate: '{}',
          ignoreSsl: false
        },
        tags: [{ id: 'tag_1', name: '影音', color: '#3b82f6', icon: 'apps-outline', sortOrder: 1 }],
        subscriptions: [
          {
            id: 'sub_1',
            name: 'Netflix',
            description: '',
            websiteUrl: 'https://netflix.com',
            logoUrl: '/static/logos/netflix.png',
            logoSource: 'upload',
            logoFetchedAt: null,
            status: 'active',
            amount: 15,
            currency: 'USD',
            billingIntervalCount: 1,
            billingIntervalUnit: 'month',
            autoRenew: true,
            startDate: '2026-04-01',
            nextRenewalDate: '2026-05-01',
            notifyDaysBefore: 3,
            advanceReminderRules: '3&09:30;0&09:30;',
            overdueReminderRules: '1&09:30;',
            webhookEnabled: true,
            notes: '',
            tagIds: ['tag_1'],
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z'
          }
        ],
        paymentRecords: [],
        subscriptionOrder: ['sub_1']
      },
      assets: {
        logos: [
          {
            path: 'logos/netflix.png',
            filename: 'netflix.png',
            sourceLogoUrl: '/static/logos/netflix.png',
            contentType: 'image/png',
            referencedBySubscriptionIds: ['sub_1']
          }
        ]
      }
    }

    mocks.getWorkerLogoBucketMock.mockReturnValue(null)
    mocks.prismaMock.tag.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mocks.prismaMock.subscription.findMany.mockResolvedValue([])
    mocks.prismaMock.paymentRecord.findMany.mockResolvedValue([])
    mocks.prismaMock.tag.create.mockResolvedValue({ id: 'tag_1' })
    mocks.prismaMock.subscription.create.mockResolvedValue({ id: 'sub_1' })
    mocks.prismaMock.subscriptionTag.createMany.mockResolvedValue({ count: 1 })
    mocks.getSubscriptionOrderMock.mockResolvedValue([])
    mocks.setSubscriptionOrderMock.mockResolvedValue(undefined)
    mocks.setSettingMock.mockResolvedValue(undefined)

    const result = await commitSubtrackerBackup({
      manifest,
      logoAssets: [
        {
          path: 'logos/netflix.png',
          filename: 'netflix.png',
          contentType: 'image/png',
          base64: Buffer.from('fake-image').toString('base64')
        }
      ],
      mode: 'append',
      restoreSettings: false
    })

    expect(mocks.prismaMock.subscription.create).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      mode: 'append',
      importedTags: 1,
      importedSubscriptions: 1,
      importedPaymentRecords: 0
    })
  })
})
