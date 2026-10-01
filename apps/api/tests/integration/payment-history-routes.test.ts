import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { buffer as collectBuffer } from 'node:stream/consumers'
import { Readable } from 'node:stream'
import { PrismaClient } from '@prisma/client'
import AdmZip from 'adm-zip'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ prisma: undefined as unknown as PrismaClient, root: '', rates: vi.fn(), timezone: 'Asia/Shanghai' }))
vi.mock('../../src/db', () => ({ get prisma() { return state.prisma } }))
vi.mock('../../src/services/auth.service', () => ({ verifyToken: vi.fn(async (token?: string) => token === 'payment-test' ? { username: 'admin' } : null) }))
vi.mock('../../src/services/exchange-rate.service', () => ({ getBaseCurrency: vi.fn(async () => 'CNY'), ensureExchangeRates: state.rates }))
vi.mock('../../src/services/settings.service', async original => ({
  ...await original<typeof import('../../src/services/settings.service')>(), getAppTimezone: vi.fn(async () => state.timezone)
}))
vi.mock('../../src/services/logo.service', async original => {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  state.root = await mkdtemp(path.join(tmpdir(), 'subtracker-payments-'))
  vi.stubEnv('LOGO_STORAGE_DIR', path.join(state.root, 'logos'))
  return { ...await original<typeof import('../../src/services/logo.service')>(), getLocalLogoLibrary: vi.fn(async () => []) }
})
import { buildApp } from '../../src/app'
import { createSubtrackerBackupArchive, inspectSubtrackerBackupFile, commitSubtrackerBackup } from '../../src/services/subtracker-backup.service'
import { summarizePayments } from '../../src/services/payment-history.service'

const headers = { authorization: 'Bearer payment-test', 'x-subtracker-locale': 'en-US' }
const subscription = { name: 'Ledger', amount: 10, currency: 'USD', billingIntervalUnit: 'month',
  startDate: '2026-01-01', nextRenewalDate: '2026-02-01' }
const payment = { amount: 10, currency: 'USD', paidAt: '2026-01-12', periodStart: '2026-01-01', periodEnd: '2026-02-01',
  conversion: { mode: 'manual', baseCurrency: 'CNY', exchangeRate: 7.2 }, note: 'Receipt', confirmManual: false }

describe('payment history with disposable SQLite', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  beforeAll(async () => {
    expect(state.root).not.toBe('')
    await mkdir(path.join(state.root, 'logos'))
    vi.stubEnv('BACKUP_TEMP_DIR', path.join(state.root, 'backups'))
    vi.stubEnv('SUBSCRIPTION_IMAGE_STORAGE_DIR', path.join(state.root, 'images'))
    state.prisma = new PrismaClient({ datasources: { db: { url: `file:${path.join(state.root, 'test.db').replace(/\\/g, '/')}` } } })
    const ddl = execFileSync(process.execPath, [createRequire(import.meta.url).resolve('prisma/build/index.js'), 'migrate', 'diff',
      '--from-empty', '--to-schema-datamodel', path.resolve(__dirname, '../../prisma/schema.prisma'), '--script'],
    { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'file:unused.db' } })
    for (const statement of ddl.split(';').filter(part => part.trim())) await state.prisma.$executeRawUnsafe(statement)
    app = await buildApp()
  }, 30000)
  beforeEach(async () => {
    state.timezone = 'Asia/Shanghai'
    state.rates.mockReset().mockResolvedValue({ baseCurrency: 'CNY', rates: { USD: 0.125, EUR: 0.1 } })
    await state.prisma.subscription.deleteMany()
    await state.prisma.tag.deleteMany()
    await state.prisma.setting.deleteMany()
  })
  afterAll(async () => { await app?.close(); await state.prisma?.$disconnect(); vi.unstubAllEnvs(); await rm(state.root, {recursive: true, force: true}) })
  async function create(extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/subscriptions', headers, payload: { ...subscription, ...extra } })
    expect(res.statusCode, res.body).toBe(201)
    return res.json().data.id as string
  }
  async function record(subscriptionId: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/payment-records', headers, payload: { ...payment, subscriptionId, ...extra } })
    expect(res.statusCode, res.body).toBe(200)
    return res.json().data
  }
  const get = (query = '') => app.inject({ url: `/api/v1/payment-records${query}`, headers })

  it.each([['GET', '/payment-records'], ['GET', '/payment-records/summary'], ['POST', '/payment-records'], ['PUT', '/payment-records/legacy-id'], ['DELETE', '/payment-records/legacy-id?revision=0']] as const)('authenticates %s %s', async (method, url) => {
    const res = await app.inject({ method, url: `/api/v1${url}` })
    expect(res.statusCode).toBe(401)
  })
  it('books independently without reactivating or advancing a subscription', async () => {
    const id = await create()
    await state.prisma.subscription.update({ where: {id}, data: {status: 'cancelled'} })
    const before = await state.prisma.subscription.findUniqueOrThrow({ where: {id} })
    const added = await record(id)
    expect(added).toMatchObject({ amount: 10, convertedAmount: 72, exchangeRate: 7.2, source: 'manual', rateSource: 'manual', revision: 0 })
    expect(await state.prisma.subscription.findUniqueOrThrow({where:{id}})).toEqual(before)
    expect(state.rates).not.toHaveBeenCalled()
    const updated = await app.inject({method:'PUT', url:`/api/v1/payment-records/${added.id}`, headers, payload:{...payment, amount:20, conversion:{mode:'preserve'}, revision:0}})
    expect(updated.statusCode, updated.body).toBe(200)
    expect(updated.json().data).toMatchObject({convertedAmount:144, revision:1})
    const deleted = await app.inject({method:'DELETE',url:`/api/v1/payment-records/${added.id}?revision=1`,headers})
    expect(deleted.statusCode).toBe(200)
    expect(await state.prisma.subscription.findUniqueOrThrow({where:{id}})).toEqual(before)
  })
  it('preserves legacy rounding, timestamps and unknown sources when only correcting notes', async () => {
    const id = await create()
    const date = new Date('2026-01-12T12:34:56.000Z')
    const old = await state.prisma.paymentRecord.create({data:{id:'old-payment',subscriptionId:id,amount:10,currency:'USD',baseCurrency:'CNY',convertedAmount:70.03,exchangeRate:7,paidAt:date,periodStart:new Date('2026-01-01T08:00Z'),periodEnd:new Date('2026-02-01T09:00Z')}})
    const updated = await app.inject({method:'PUT',url:'/api/v1/payment-records/old-payment',headers,payload:{...payment,revision:0,note:'Corrected',conversion:{mode:'preserve'}}})
    expect(updated.statusCode, updated.body).toBe(200)
    expect(updated.json().data).toMatchObject({source:'legacy',rateSource:'legacy',convertedAmount:70.03,exchangeRate:7,note:'Corrected',paidAt:date.toISOString(),periodStart:old.periodStart.toISOString(),periodEnd:old.periodEnd.toISOString()})
    expect(state.rates).not.toHaveBeenCalled()
  })
  it('requires an explicit new conversion for currency changes and labels current-rate use', async () => {
    const id = await create(), added = await record(id)
    const invalid = await app.inject({method:'PUT',url:`/api/v1/payment-records/${added.id}`,headers,payload:{...payment,revision:0,currency:'EUR',conversion:{mode:'preserve'}}})
    expect(invalid.statusCode).toBe(422)
    const current = await record(id,{conversion:{mode:'current',baseCurrency:'CNY'}})
    expect(current).toMatchObject({convertedAmount:80,exchangeRate:8,rateSource:'current'})
    const same = await record(id,{currency:'CNY',conversion:{mode:'current',baseCurrency:'CNY'}})
    expect(same).toMatchObject({convertedAmount:10,exchangeRate:1})
    expect(state.rates).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid money, nonexistent dates, reversed periods and mismatched same-currency rates', async () => {
    const id = await create()
    for (const extra of [{amount:-1},{amount:1e13},{paidAt:'2026-02-30'},{periodEnd:'2025-12-31'},{currency:'CNY',conversion:{mode:'manual',baseCurrency:'CNY',exchangeRate:2}},{conversion:{mode:'preserve'}}]) {
      const res = await app.inject({method:'POST',url:'/api/v1/payment-records',headers,payload:{...payment,subscriptionId:id,...extra}})
      expect(res.statusCode, res.body).toBe(422)
    }
    expect(await state.prisma.paymentRecord.count()).toBe(0)
  })
  it('detects stale edits/deletes and requires explicit confirmation before changing automatic sources', async () => {
    const id = await create(), added = await record(id)
    await state.prisma.paymentRecord.update({where:{id:added.id},data:{source:'automatic'}})
    const update = (confirmManual=false) => app.inject({method:'PUT',url:`/api/v1/payment-records/${added.id}`,headers,payload:{...payment,revision:0,confirmManual,conversion:{mode:'preserve'}}})
    const first=await update(true)
    expect(first.json().data).toMatchObject({source:'manual',revision:1})
    expect((await update()).statusCode).toBe(409)
    expect((await app.inject({method:'DELETE',url:`/api/v1/payment-records/${added.id}?revision=0`,headers})).statusCode).toBe(409)
    expect(await state.prisma.paymentRecord.count()).toBe(1)
  })
  it('groups by saved currency, uses timezone calendar months, and never double-counts tagged records', async () => {
    const first = await create(), second = await create({name:'Other'})
    const tags=await Promise.all(['A','B'].map(name=>state.prisma.tag.create({data:{name}})))
    await state.prisma.subscriptionTag.createMany({data:tags.map(tag=>({subscriptionId:first,tagId:tag.id}))})
    await record(first)
    const automatic=await record(first,{amount:5})
    await state.prisma.paymentRecord.update({where:{id:automatic.id},data:{source:'automatic',paidAt:new Date('2025-12-31T16:00Z')}})
    const legacy=await record(second,{amount:3,currency:'EUR',conversion:{mode:'manual',baseCurrency:'EUR',exchangeRate:1}})
    await state.prisma.paymentRecord.update({where:{id:legacy.id},data:{source:'legacy'}})
    const result=await summarizePayments({page:1,pageSize:20},new Date('2026-05-01'))
    expect(result.totals).toEqual([{currency:'CNY',amount:108,count:2,manual:1,automatic:1,legacy:0},{currency:'EUR',amount:3,count:1,manual:0,automatic:0,legacy:1}])
    expect(result.thisYear).toEqual(result.totals)
    expect(result.monthly).toEqual([{month:'2026-01',currency:'CNY',amount:108,count:2},{month:'2026-01',currency:'EUR',amount:3,count:1}])
    const filtered=await get(`/summary?tagId=${tags[0]!.id}&source=automatic&from=2026-01-01&to=2026-01-01`)
    expect(filtered.json().data).toMatchObject({count:1,totals:[{currency:'CNY',amount:36}]})
    expect((await get('?from=2026-01-01&to=2026-01-01')).json().data.total).toBe(1)
  })
  it('paginates stably, clamps empty pages, filters legacy IDs and bounds query sizes', async () => {
    await state.prisma.subscription.create({data:{...subscription,id:'legacy-sub',billingIntervalUnit:'month',startDate:new Date(subscription.startDate),nextRenewalDate:new Date(subscription.nextRenewalDate)}})
    await record('legacy-sub'); await record('legacy-sub')
    const result=(await get('?subscriptionId=legacy-sub&page=9&pageSize=1')).json().data
    expect(result).toMatchObject({page:2,pageSize:1,total:2})
    expect(result.items).toHaveLength(1)
    expect((await get('?pageSize=1000')).statusCode).toBe(422)
    expect((await get('?from=2026-03-01&to=2026-02-01')).statusCode).toBe(422)
  })
  it('records the first purchase only when selected, including lifetime, without advancing dates', async () => {
    const noPayment=await create()
    expect(await state.prisma.paymentRecord.count({where:{subscriptionId:noPayment}})).toBe(0)
    const lifetime=await create({billingType:'lifetime',recordInitialPayment:true})
    const rows=await state.prisma.paymentRecord.findMany({where:{subscriptionId:lifetime}})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({source:'manual',rateSource:'current',convertedAmount:80})
    expect(rows[0]!.periodStart).toEqual(rows[0]!.periodEnd)
    expect((await state.prisma.subscription.findUniqueOrThrow({where:{id:lifetime}})).nextRenewalDate).toEqual(rows[0]!.periodStart)
  })
  it('round-trips metadata in standard backups; legacy restores retain original amounts and default unknown metadata', async () => {
    const id=await create(), added=await record(id)
    for (const format of ['standard','legacy-v0.11'] as const) {
      const archive=await createSubtrackerBackupArchive(false,format)
      const bytes=await collectBuffer(archive.stream)
      const manifest=JSON.parse(new AdmZip(bytes).getEntries().find(entry => entry.entryName === 'manifest.json')!.getData().toString())
      if(format==='standard') expect(manifest.data.paymentRecords[0]).toMatchObject({source:'manual',rateSource:'manual',note:'Receipt'})
      else expect(manifest.data.paymentRecords[0]).not.toHaveProperty('source')
      const preview=await inspectSubtrackerBackupFile(Readable.from([bytes]),'en-US')
      await commitSubtrackerBackup({importToken:preview.importToken,mode:'replace',restoreSettings:true},'en-US')
      const restored=await state.prisma.paymentRecord.findUniqueOrThrow({where:{id:added.id}})
      expect(restored).toMatchObject({amount:10,exchangeRate:7.2,convertedAmount:72,source:format==='standard'?'manual':'legacy',note:format==='standard'?'Receipt':''})
    }
  })
})
