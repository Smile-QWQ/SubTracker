import cron from 'node-cron'
import { DEFAULT_APP_LOCALE, getMessage } from '@subtracker/shared'
import { config } from '../config'
import { refreshExchangeRates } from './exchange-rate.service'
import { scanRenewalNotifications } from './notification.service'
import { parseDailyCronForTimezoneGate, runDailyTaskAtLocalHour } from './cron-gate.service'
import { getAppTimezone } from './settings.service'
import { autoRenewDueSubscriptions, reconcileExpiredSubscriptions } from './subscription.service'
import { cleanupOldNotificationDedupSettings } from './channel-notification.service'

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

function formatChannelSummary(result: NotificationScan) {
  const summary = summarizeChannelResults(result)
  const locale = DEFAULT_APP_LOCALE
  const parts = Object.entries(summary)
    .map(([channel, counts]) => {
      const success = counts.success ?? 0
      const failed = counts.failed ?? 0
      const skipped = counts.skipped ?? 0
      return getMessage(locale, 'scheduler.channelSummary.item', {
        channel: getMessage(locale, `notifications.channels.${channel}`),
        success,
        failed,
        skipped
      })
    })
    .join(getMessage(locale, 'common.separators.notificationDetail'))

  return parts ? `${getMessage(locale, 'common.separators.notificationDetail')}${parts}` : ''
}

function logReminderScan(result: NotificationScan) {
  const locale = DEFAULT_APP_LOCALE
  console.log(
    getMessage(locale, 'scheduler.logs.reminderScan', {
      processedCount: result.processedCount,
      matchedReminderCount: result.matchedReminderCount,
      notificationCount: result.notificationCount,
      channelSummary: formatChannelSummary(result)
    })
  )
}

export async function cleanupNotificationDedupSettingsOncePerDay(now = new Date()) {
  return runDailyTaskAtLocalHour('cleanupNotificationDedupSettings', await getAppTimezone(), 3, now, async () => {
    const deleted = await cleanupOldNotificationDedupSettings(now)
    if (deleted > 0) {
      console.log(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.notificationDedupCleanup', { deleted }))
    }
  })
}

export function startSchedulers() {
  const refreshRatesCronGate = parseDailyCronForTimezoneGate(config.cronRefreshRates)
  cron.schedule(refreshRatesCronGate?.triggerCron ?? config.cronRefreshRates, async () => {
    try {
      if (refreshRatesCronGate) {
        const executed = await runDailyTaskAtLocalHour(
          'refreshExchangeRates',
          await getAppTimezone(),
          refreshRatesCronGate.localHour,
          new Date(),
          async () => {
            await refreshExchangeRates()
          }
        )
        if (executed) {
          console.log(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.exchangeRatesRefreshed'))
        }
        return
      }

      await refreshExchangeRates()
      console.log(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.exchangeRatesRefreshed'))
    } catch (e) {
      console.error(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.exchangeRateRefreshFailed'), e)
    }
  })

  cron.schedule(config.cronScan, async () => {
    try {
      await autoRenewDueSubscriptions()
      await reconcileExpiredSubscriptions()
      await cleanupNotificationDedupSettingsOncePerDay()
      const result = await scanRenewalNotifications()
      logReminderScan(result)
    } catch (e) {
      console.error(getMessage(DEFAULT_APP_LOCALE, 'scheduler.logs.reminderScanFailed'), e)
    }
  })
}
