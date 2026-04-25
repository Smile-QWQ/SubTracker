import cron from 'node-cron'
import { config } from '../config'
import { refreshExchangeRates } from './exchange-rate.service'
import { scanRenewalNotifications } from './notification.service'
import { parseDailyCronForTimezoneGate, runDailyTaskAtLocalHour } from './cron-gate.service'
import { getAppTimezone } from './settings.service'
import { autoRenewDueSubscriptions, reconcileExpiredSubscriptions } from './subscription.service'

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
      await scanRenewalNotifications()
      console.log('[cron] subscription reminders scanned')
    } catch (e) {
      console.error('[cron] reminder scan failed', e)
    }
  })
}
