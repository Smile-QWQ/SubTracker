import type { FastifyReply } from 'fastify'

export function sendOk<T>(reply: FastifyReply, data: T, meta?: Record<string, unknown>) {
  return reply.status(200).send({ data, meta })
}

export function sendCreated<T>(reply: FastifyReply, data: T) {
  return reply.status(201).send({ data })
}

export function sendError(reply: FastifyReply, status: number, code: string, message: string, details?: unknown) {
  return reply.status(status).send({
    error: {
      code,
      message,
      details
    }
  })
}
