import cron from 'node-cron'
import { config } from '../config'
import { refreshExchangeRates } from './exchange-rate.service'
import { scanRenewalNotifications } from './notification.service'
import { autoRenewDueSubscriptions } from './subscription.service'

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
      await scanRenewalNotifications()
      console.log('[cron] subscription reminders scanned')
    } catch (e) {
      console.error('[cron] reminder scan failed', e)
    }
  })
}
