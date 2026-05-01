import cron from 'node-cron'
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

export async function cleanupNotificationDedupStateOncePerDay(now = new Date()) {
  return runDailyTaskAtLocalHour('cleanupNotificationDedupSettings', await getAppTimezone(), 3, now, async () => {
    const legacyDeleted = await cleanupLegacyNotificationDedupSettings(now)
    if (legacyDeleted > 0) {
      console.log(`[cron] legacy notification dedup cleanup：清理 ${legacyDeleted} 条旧 Setting 记录`)
    }

    const claimDeleted = await cleanupNotificationDeliveryClaims(now)
    if (claimDeleted > 0) {
      console.log(`[cron] notification delivery cleanup：清理 ${claimDeleted} 条去重占位记录`)
    }
  })
}

export function startSchedulers() {
  cron.schedule(config.cronRefreshRates, async () => {
    try {
      await refreshExchangeRates()
      console.log('[cron] exchange rates refreshed')
    } catch (e) {
      console.error('[cron] exchange rate refresh failed', e)
    }
  })

  cron.schedule(config.cronScan, async () => {
    try {
      await autoRenewDueSubscriptions()
      await cleanupNotificationDedupStateOncePerDay()
      const result = await scanRenewalNotifications()
      logReminderScan(result)
    } catch (e) {
      console.error('[cron] reminder scan failed', e)
    }
  })
}

export const cleanupNotificationDedupSettingsOncePerDay = cleanupNotificationDedupStateOncePerDay
