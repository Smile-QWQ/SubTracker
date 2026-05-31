import cron from 'node-cron'
import { getMessage } from '@subtracker/shared'
import { DEFAULT_APP_LOCALE } from '@subtracker/shared/locale-core'
import { config } from '../config'
import { refreshExchangeRates } from './exchange-rate.service'
import { scanRenewalNotifications } from './notification.service'
import {
  cleanupLegacyNotificationDedupSettings,
  cleanupNotificationDeliveryClaims
} from './channel-notification.service'
import { getAppTimezone } from './settings.service'
import { runDailyTaskAtLocalHour } from './worker-cron.service'
import { autoRenewDueSubscriptions } from './subscription.service'

type NotificationScan = Awaited<ReturnType<typeof scanRenewalNotifications>>

function summarizeChannelResults(result: NotificationScan) {
  const summary: Record<string, Record<string, number>> = {}

  for (const notification of result.notifications) {
    for (const channelResult of notification.channelResults) {
      summary[channelResult.channel] ??= {}
      summary[channelResult.channel][channelResult.status] = (summary[channelResult.channel][channelResult.status] ?? 0) + 1
    }
  }

  return summary
}

const CHANNEL_LABELS: Record<string, string> = {
  webhook: getMessage(DEFAULT_APP_LOCALE, 'notifications.channels.webhook'),
  email: getMessage(DEFAULT_APP_LOCALE, 'notifications.channels.email'),
  pushplus: getMessage(DEFAULT_APP_LOCALE, 'notifications.channels.pushplus'),
  telegram: getMessage(DEFAULT_APP_LOCALE, 'notifications.channels.telegram'),
  serverchan: getMessage(DEFAULT_APP_LOCALE, 'notifications.channels.serverchan'),
  gotify: getMessage(DEFAULT_APP_LOCALE, 'notifications.channels.gotify')
}

function formatChannelSummary(result: NotificationScan) {
  const summary = summarizeChannelResults(result)
  const parts = Object.entries(summary)
    .map(([channel, counts]) => {
      const success = counts.success ?? 0
      const failed = counts.failed ?? 0
      const skipped = counts.skipped ?? 0
      return getMessage(DEFAULT_APP_LOCALE, 'scheduler.channelSummary.item', {
        channel: CHANNEL_LABELS[channel] ?? channel,
        success,
        failed,
        skipped
      })
    })
    .join(getMessage(DEFAULT_APP_LOCALE, 'common.separators.notificationDetail'))

  return parts ? `；${parts}` : ''
}

function logReminderScan(result: NotificationScan) {
  console.log(
    getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.reminderScan', {
      processedCount: result.processedCount,
      matchedReminderCount: result.matchedReminderCount,
      notificationCount: result.notificationCount,
      channelSummary: formatChannelSummary(result)
    })
  )
}

export async function cleanupNotificationDedupStateOncePerDay(now = new Date()) {
  return runDailyTaskAtLocalHour('cleanupNotificationDedupSettings', await getAppTimezone(), 3, now, async () => {
    const legacyDeleted = await cleanupLegacyNotificationDedupSettings(now)
    if (legacyDeleted > 0) {
      console.log(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.notificationDedupCleanup', { deleted: legacyDeleted }))
    }

    const claimDeleted = await cleanupNotificationDeliveryClaims(now)
    if (claimDeleted > 0) {
      console.log(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.notificationDedupCleanup', { deleted: claimDeleted }))
    }
  })
}

export function startSchedulers() {
  cron.schedule(config.cronRefreshRates, async () => {
    try {
      await refreshExchangeRates()
      console.log(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.exchangeRatesRefreshed'))
    } catch (e) {
      console.error(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.exchangeRateRefreshFailed'), e)
    }
  })

  cron.schedule(config.cronScan, async () => {
    try {
      await autoRenewDueSubscriptions()
      await cleanupNotificationDedupStateOncePerDay()
      const result = await scanRenewalNotifications()
      logReminderScan(result)
    } catch (e) {
      console.error(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.reminderScanFailed'), e)
    }
  })
}

export const cleanupNotificationDedupSettingsOncePerDay = cleanupNotificationDedupStateOncePerDay
