import cron from 'node-cron'
import { config } from '../config'
import { refreshExchangeRates } from './exchange-rate.service'
import { scanRenewalNotifications } from './notification.service'
import { parseDailyCronForTimezoneGate, runDailyTaskAtLocalHour } from './cron-gate.service'
import { getAppTimezone } from './settings.service'
import { autoRenewDueSubscriptions, reconcileExpiredSubscriptions } from './subscription.service'

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
  webhook: 'Webhook',
  email: '邮箱',
  pushplus: 'PushPlus',
  telegram: 'Telegram',
  serverchan: 'Server 酱',
  gotify: 'Gotify'
}

function formatChannelSummary(result: NotificationScan) {
  const summary = summarizeChannelResults(result)
  const parts = Object.entries(summary)
    .map(([channel, counts]) => {
      const success = counts.success ?? 0
      const failed = counts.failed ?? 0
      const skipped = counts.skipped ?? 0
      return `${CHANNEL_LABELS[channel] ?? channel}:成功${success}/失败${failed}/跳过${skipped}`
    })
    .join('；')

  return parts ? `；${parts}` : ''
}

function logReminderScan(result: NotificationScan) {
  console.log(
    `[cron] subscription reminders scanned：候选 ${result.processedCount}，命中 ${result.matchedReminderCount}，通知 ${result.notificationCount}${formatChannelSummary(result)}`
  )
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
          console.log('[cron] exchange rates refreshed')
        }
        return
      }

      await refreshExchangeRates()
      console.log('[cron] exchange rates refreshed')
    } catch (e) {
      console.error('[cron] exchange rate refresh failed', e)
    }
  })

  cron.schedule(config.cronScan, async () => {
    try {
      await autoRenewDueSubscriptions()
      await reconcileExpiredSubscriptions()
      const result = await scanRenewalNotifications()
      logReminderScan(result)
    } catch (e) {
      console.error('[cron] reminder scan failed', e)
    }
  })
}
