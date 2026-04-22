import { FastifyInstance } from 'fastify'
import {
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_OVERDUE_REMINDER_RULES,
  SettingsSchema
} from '@subtracker/shared'
import { prisma } from '../db'
import { sendError, sendOk } from '../http'
import { getAppSettings, setSetting } from '../services/settings.service'
import {
  buildAdvanceReminderRulesFromLegacy,
  buildOverdueReminderRules,
  deriveNotifyDaysBeforeFromAdvanceRules,
  deriveNotifyOnDueDayFromAdvanceRules,
  deriveOverdueReminderDaysFromRules,
  normalizeReminderRules
} from '../services/reminder-rules.service'

function validateSettingsPayload(settings: Awaited<ReturnType<typeof getAppSettings>>) {
  const missingEmailFields = [
    ['Resend API URL', settings.emailConfig.apiBaseUrl],
    ['Resend API Key', settings.emailConfig.apiKey],
    ['发件人', settings.emailConfig.from],
    ['收件人', settings.emailConfig.to]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.emailNotificationsEnabled && missingEmailFields.length) {
    throw new Error(`启用邮箱通知时必须填写：${missingEmailFields.join('、')}`)
  }

  if (settings.pushplusNotificationsEnabled && !settings.pushplusConfig.token.trim()) {
    throw new Error('启用 PushPlus 时必须填写 Token')
  }

  const missingTelegramFields = [
    ['Bot Token', settings.telegramConfig.botToken],
    ['Chat ID', settings.telegramConfig.chatId]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.telegramNotificationsEnabled && missingTelegramFields.length) {
    throw new Error(`启用 Telegram 通知时必须填写：${missingTelegramFields.join('、')}`)
  }

  const missingAiFields = [
    ['Provider 名称', settings.aiConfig.providerName],
    ['Model', settings.aiConfig.model],
    ['API Base URL', settings.aiConfig.baseUrl],
    ['API Key', settings.aiConfig.apiKey]
  ]
    .filter(([, value]) => !String(value ?? '').trim())
    .map(([label]) => label)

  if (settings.aiConfig.enabled && missingAiFields.length) {
    throw new Error(`启用 AI 识别时必须填写：${missingAiFields.join('、')}`)
  }
}

function normalizeReminderSettingsPayload(
  payload: Partial<Awaited<ReturnType<typeof getAppSettings>>>,
  currentSettings: Awaited<ReturnType<typeof getAppSettings>>
) {
  const nextSettings = {
    defaultAdvanceReminderRules:
      payload.defaultAdvanceReminderRules !== undefined
        ? normalizeReminderRules(payload.defaultAdvanceReminderRules, 'advance')
        : payload.defaultNotifyDays !== undefined || payload.notifyOnDueDay !== undefined
          ? buildAdvanceReminderRulesFromLegacy(
              payload.defaultNotifyDays ?? currentSettings.defaultNotifyDays,
              payload.notifyOnDueDay ?? currentSettings.notifyOnDueDay
            ) || DEFAULT_ADVANCE_REMINDER_RULES
          : currentSettings.defaultAdvanceReminderRules,
    defaultOverdueReminderRules:
      payload.defaultOverdueReminderRules !== undefined
        ? normalizeReminderRules(payload.defaultOverdueReminderRules, 'overdue')
        : payload.overdueReminderDays !== undefined
          ? buildOverdueReminderRules(payload.overdueReminderDays) || DEFAULT_OVERDUE_REMINDER_RULES
          : currentSettings.defaultOverdueReminderRules
  }

  return {
    ...nextSettings,
    defaultNotifyDays: deriveNotifyDaysBeforeFromAdvanceRules(nextSettings.defaultAdvanceReminderRules),
    notifyOnDueDay: deriveNotifyOnDueDayFromAdvanceRules(nextSettings.defaultAdvanceReminderRules),
    overdueReminderDays: deriveOverdueReminderDaysFromRules(nextSettings.defaultOverdueReminderRules)
  }
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings/export/subscriptions', async (request, reply) => {
    const formatValue = (request.query as { format?: string } | undefined)?.format
    const format = formatValue === 'csv' || formatValue === 'json' ? formatValue : null

    if (!format) {
      return sendError(reply, 422, 'validation_error', 'Export format must be csv or json')
    }

    const subscriptions = await prisma.subscription.findMany({
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [{ createdAt: 'asc' }]
    })

    const rows = subscriptions.map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      description: subscription.description,
      websiteUrl: subscription.websiteUrl ?? '',
      logoUrl: subscription.logoUrl ?? '',
      logoSource: subscription.logoSource ?? '',
      status: subscription.status,
      amount: subscription.amount,
      currency: subscription.currency,
      billingIntervalCount: subscription.billingIntervalCount,
      billingIntervalUnit: subscription.billingIntervalUnit,
      autoRenew: subscription.autoRenew,
      startDate: subscription.startDate.toISOString().slice(0, 10),
      nextRenewalDate: subscription.nextRenewalDate.toISOString().slice(0, 10),
      notifyDaysBefore: subscription.notifyDaysBefore,
      advanceReminderRules: subscription.advanceReminderRules ?? '',
      overdueReminderRules: subscription.overdueReminderRules ?? '',
      webhookEnabled: subscription.webhookEnabled,
      notes: subscription.notes,
      tags: subscription.tags
        .map((item) => item.tag)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
          sortOrder: tag.sortOrder
        })),
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString()
    }))

    if (format === 'json') {
      reply.header('Content-Type', 'application/json; charset=utf-8')
      reply.header('Content-Disposition', 'attachment; filename="subtracker-subscriptions.json"')
      return reply.send(JSON.stringify(rows, null, 2))
    }

    const escapeCsv = (value: unknown) => {
      const text = String(value ?? '')
      return `"${text.replaceAll('"', '""')}"`
    }

    const headers = [
      'id',
      'name',
      'description',
      'websiteUrl',
      'logoUrl',
      'logoSource',
      'status',
      'amount',
      'currency',
      'billingIntervalCount',
      'billingIntervalUnit',
      'autoRenew',
      'startDate',
      'nextRenewalDate',
      'notifyDaysBefore',
      'advanceReminderRules',
      'overdueReminderRules',
      'webhookEnabled',
      'notes',
      'tags',
      'createdAt',
      'updatedAt'
    ]

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        [
          row.id,
          row.name,
          row.description,
          row.websiteUrl,
          row.logoUrl,
          row.logoSource,
          row.status,
          row.amount,
          row.currency,
          row.billingIntervalCount,
          row.billingIntervalUnit,
          row.autoRenew,
          row.startDate,
          row.nextRenewalDate,
          row.notifyDaysBefore,
          row.advanceReminderRules,
          row.overdueReminderRules,
          row.webhookEnabled,
          row.notes,
          row.tags.map((tag) => tag.name).join(', '),
          row.createdAt,
          row.updatedAt
        ]
          .map(escapeCsv)
          .join(',')
      )
    ].join('\n')

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="subtracker-subscriptions.csv"')
    return reply.send(`\uFEFF${csv}`)
  })

  app.get('/settings', async (_, reply) => {
    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })

  app.patch('/settings', async (request, reply) => {
    const parsed = SettingsSchema.partial().safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 422, 'validation_error', 'Invalid settings payload', parsed.error.flatten())
    }

    const currentSettings = await getAppSettings()
    let normalizedReminderSettings: ReturnType<typeof normalizeReminderSettingsPayload>

    try {
      normalizedReminderSettings = normalizeReminderSettingsPayload(parsed.data, currentSettings)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'Invalid reminder rules')
    }

    const nextSettings = {
      ...currentSettings,
      ...parsed.data,
      ...normalizedReminderSettings,
      emailConfig: parsed.data.emailConfig ? { ...currentSettings.emailConfig, ...parsed.data.emailConfig } : currentSettings.emailConfig,
      pushplusConfig: parsed.data.pushplusConfig ? { ...currentSettings.pushplusConfig, ...parsed.data.pushplusConfig } : currentSettings.pushplusConfig,
      telegramConfig: parsed.data.telegramConfig
        ? { ...currentSettings.telegramConfig, ...parsed.data.telegramConfig }
        : currentSettings.telegramConfig,
      aiConfig: parsed.data.aiConfig
        ? {
            ...currentSettings.aiConfig,
            ...parsed.data.aiConfig,
            capabilities: {
              ...currentSettings.aiConfig.capabilities,
              ...parsed.data.aiConfig.capabilities
            }
          }
        : currentSettings.aiConfig
    }

    try {
      validateSettingsPayload(nextSettings)
    } catch (error) {
      return sendError(reply, 422, 'validation_error', error instanceof Error ? error.message : 'Invalid settings payload')
    }

    const settingsToPersist: Array<[string, unknown]> = Object.entries(parsed.data).filter(([, value]) => value !== undefined)
    const reminderRelatedKeys = new Set([
      'defaultNotifyDays',
      'notifyOnDueDay',
      'overdueReminderDays',
      'defaultAdvanceReminderRules',
      'defaultOverdueReminderRules'
    ])

    const filteredEntries = settingsToPersist.filter(([key]) => !reminderRelatedKeys.has(key))
    filteredEntries.push(
      ['defaultAdvanceReminderRules', normalizedReminderSettings.defaultAdvanceReminderRules],
      ['defaultOverdueReminderRules', normalizedReminderSettings.defaultOverdueReminderRules],
      ['defaultNotifyDays', normalizedReminderSettings.defaultNotifyDays],
      ['notifyOnDueDay', normalizedReminderSettings.notifyOnDueDay],
      ['overdueReminderDays', normalizedReminderSettings.overdueReminderDays]
    )

    await Promise.all(filteredEntries.map(([key, value]) => setSetting(key, value)))

    const settings = await getAppSettings()
    return sendOk(reply, settings)
  })
}
