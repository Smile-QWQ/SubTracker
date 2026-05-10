import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getSetting, setSetting } from './settings.service'

const CREDENTIALS_KEY = 'authCredentials'
const SESSION_SECRET_KEY = 'authSessionSecret'
const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin'
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_TOKEN_TTL_MS = 60 * 60 * 1000

let cachedSessionSecret: string | null = null
let cachedCredentials: StoredCredentials | null = null
let cachedMustChangePassword: boolean | null = null

type StoredCredentials = {
  username: string
  passwordHash: string
  passwordSalt: string
}

type SessionPayload = {
  sub: string
  iat: number
  exp: number
}

export type AuthUser = {
  username: string
  mustChangePassword: boolean
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
}

function createPasswordRecord(password: string) {
  const passwordSalt = randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, passwordSalt)
  return {
    passwordSalt,
    passwordHash
  }
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

async function getSessionSecret() {
  if (cachedSessionSecret) {
    return cachedSessionSecret
  }

  const existing = await getSetting<string | null>(SESSION_SECRET_KEY, null)
  if (existing) {
    cachedSessionSecret = existing
    return existing
  }

  const created = randomBytes(32).toString('hex')
  await setSetting(SESSION_SECRET_KEY, created)
  cachedSessionSecret = created
  return created
}

function updateCredentialsCache(credentials: StoredCredentials) {
  cachedCredentials = credentials
  cachedMustChangePassword = credentials.username === DEFAULT_USERNAME && verifyPassword(DEFAULT_PASSWORD, credentials)
}

async function saveCredentials(credentials: StoredCredentials) {
  await setSetting(CREDENTIALS_KEY, credentials)
  updateCredentialsCache(credentials)
}

export async function getStoredCredentials() {
  if (cachedCredentials) {
    return cachedCredentials
  }

  const existing = await getSetting<StoredCredentials | null>(CREDENTIALS_KEY, null)
  if (existing) {
    updateCredentialsCache(existing)
    return existing
  }

  const defaultRecord = createPasswordRecord(DEFAULT_PASSWORD)
  const created: StoredCredentials = {
    username: DEFAULT_USERNAME,
    ...defaultRecord
  }

  await setSetting(CREDENTIALS_KEY, created)
  updateCredentialsCache(created)
  return created
}

function verifyPassword(password: string, record: StoredCredentials) {
  const actual = Buffer.from(hashPassword(password, record.passwordSalt), 'hex')
  const expected = Buffer.from(record.passwordHash, 'hex')

  if (actual.length !== expected.length) {
    return false
  }

  return timingSafeEqual(actual, expected)
}

async function isUsingDefaultCredentials() {
  if (cachedMustChangePassword !== null) {
    return cachedMustChangePassword
  }

  const credentials = await getStoredCredentials()
  cachedMustChangePassword = credentials.username === DEFAULT_USERNAME && verifyPassword(DEFAULT_PASSWORD, credentials)
  return cachedMustChangePassword
}

async function buildAuthUser(username: string): Promise<AuthUser> {
  return {
    username,
    mustChangePassword: await isUsingDefaultCredentials()
  }
}

async function signPayload(payload: SessionPayload) {
  const secret = await getSessionSecret()
  const body = encodeBase64Url(JSON.stringify(payload))
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export async function issueToken(username: string, ttlMs = TOKEN_TTL_MS) {
  const now = Date.now()
  return signPayload({
    sub: username,
    iat: now,
    exp: now + Math.max(ttlMs, MIN_TOKEN_TTL_MS)
  })
}

export async function verifyToken(token?: string) {
  if (!token) return null

  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const secret = await getSessionSecret()
  const expectedSignature = createHmac('sha256', secret).update(body).digest('base64url')

  const actual = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null
  }

  try {
    const payload = JSON.parse(decodeBase64Url(body)) as SessionPayload
    if (!payload.sub || payload.exp < Date.now()) {
      return null
    }

    return await buildAuthUser(payload.sub)
  } catch {
    return null
  }
}

export async function loginWithCredentials(
  username: string,
  password: string,
  options?: {
    rememberMe?: boolean
    rememberDays?: number
  }
) {
  const credentials = await getStoredCredentials()
  if (credentials.username !== username || !verifyPassword(password, credentials)) {
    return null
  }

  const rememberDays = Math.max(1, options?.rememberDays ?? 7)
  const ttlMs = options?.rememberMe ? rememberDays * 24 * 60 * 60 * 1000 : TOKEN_TTL_MS

  return {
    token: await issueToken(credentials.username, ttlMs),
    user: await buildAuthUser(credentials.username)
  }
}

export async function changeCredentials(input: {
  oldUsername: string
  oldPassword: string
  newUsername: string
  newPassword: string
}) {
  const credentials = await getStoredCredentials()
  if (credentials.username !== input.oldUsername || !verifyPassword(input.oldPassword, credentials)) {
    return null
  }

  const nextPassword = createPasswordRecord(input.newPassword)
  const nextCredentials: StoredCredentials = {
    username: input.newUsername,
    ...nextPassword
  }

  await saveCredentials(nextCredentials)

  return {
    token: await issueToken(input.newUsername),
    user: await buildAuthUser(input.newUsername)
  }
}

export async function changeDefaultPassword(newPassword: string) {
  const credentials = await getStoredCredentials()
  const usingDefaultCredentials =
    credentials.username === DEFAULT_USERNAME && verifyPassword(DEFAULT_PASSWORD, credentials)

  if (!usingDefaultCredentials) {
    return null
  }

  const nextPassword = createPasswordRecord(newPassword)
  const nextCredentials: StoredCredentials = {
    username: DEFAULT_USERNAME,
    ...nextPassword
  }

  await saveCredentials(nextCredentials)

  return {
    token: await issueToken(DEFAULT_USERNAME),
    user: await buildAuthUser(DEFAULT_USERNAME)
  }
}

export async function resetPasswordForStoredUsername(username: string, newPassword: string) {
  const credentials = await getStoredCredentials()
  if (credentials.username !== username) {
    return null
  }

  const nextPassword = createPasswordRecord(newPassword)
  const nextCredentials: StoredCredentials = {
    username,
    ...nextPassword
  }

  await saveCredentials(nextCredentials)

  return {
    token: await issueToken(username),
    user: await buildAuthUser(username)
  }
}
