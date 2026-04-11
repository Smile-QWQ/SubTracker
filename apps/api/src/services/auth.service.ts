import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getSetting, setSetting } from './settings.service'

const CREDENTIALS_KEY = 'authCredentials'
const SESSION_SECRET_KEY = 'authSessionSecret'
const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin'
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
  const existing = await getSetting<string | null>(SESSION_SECRET_KEY, null)
  if (existing) return existing

  const created = randomBytes(32).toString('hex')
  await setSetting(SESSION_SECRET_KEY, created)
  return created
}

export async function getStoredCredentials() {
  const existing = await getSetting<StoredCredentials | null>(CREDENTIALS_KEY, null)
  if (existing) return existing

  const defaultRecord = createPasswordRecord(DEFAULT_PASSWORD)
  const created: StoredCredentials = {
    username: DEFAULT_USERNAME,
    ...defaultRecord
  }

  await setSetting(CREDENTIALS_KEY, created)
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

async function signPayload(payload: SessionPayload) {
  const secret = await getSessionSecret()
  const body = encodeBase64Url(JSON.stringify(payload))
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export async function issueToken(username: string) {
  const now = Date.now()
  return signPayload({
    sub: username,
    iat: now,
    exp: now + TOKEN_TTL_MS
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

    return {
      username: payload.sub
    } satisfies AuthUser
  } catch {
    return null
  }
}

export async function loginWithCredentials(username: string, password: string) {
  const credentials = await getStoredCredentials()
  if (credentials.username !== username || !verifyPassword(password, credentials)) {
    return null
  }

  return {
    token: await issueToken(credentials.username),
    user: {
      username: credentials.username
    } satisfies AuthUser
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

  await setSetting(CREDENTIALS_KEY, nextCredentials)

  return {
    token: await issueToken(input.newUsername),
    user: {
      username: input.newUsername
    } satisfies AuthUser
  }
}
