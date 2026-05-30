import 'fastify'
import type { AppLocale } from '@subtracker/shared/locale-core'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      username: string
      mustChangePassword: boolean
    }
    locale?: AppLocale
  }
}
