import { buildApp } from './app'
import { config } from './config'
import { startSchedulers } from './services/scheduler.service'
import { refreshExchangeRates } from './services/exchange-rate.service'

async function start() {
  const app = await buildApp()

  try {
    await refreshExchangeRates()
  } catch (error) {
    console.warn('[api] 初始汇率刷新失败，将回退到已有快照。', error)
  }

  startSchedulers()

  await app.listen({ port: config.port, host: config.host })
  console.log(`[api] 已启动: http://${config.host}:${config.port}`)
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
