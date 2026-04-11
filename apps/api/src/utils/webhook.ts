import { createHmac } from 'node:crypto'

export function signWebhookPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}
