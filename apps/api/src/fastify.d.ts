import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      username: string
    }
  }
}
