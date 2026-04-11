import { FastifyInstance } from 'fastify'
import { AiConfigSchema } from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import { recognizeSubscriptionByAi, testAiConnection } from '../services/ai.service'

export async function aiRoutes(app: FastifyInstance) {
  app.post('/ai/test', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = AiConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid AI config payload', parsed.error.flatten())
        }
        return sendOk(
          reply,
          await testAiConnection({
            enabled: parsed.data.enabled ?? false,
            providerName: parsed.data.providerName ?? 'Custom',
            baseUrl: parsed.data.baseUrl ?? '',
            apiKey: parsed.data.apiKey ?? '',
            model: parsed.data.model ?? '',
            timeoutMs: parsed.data.timeoutMs ?? 30000,
            promptTemplate: parsed.data.promptTemplate ?? ''
          })
        )
      }

      return sendOk(reply, await testAiConnection())
    } catch (error) {
      return sendError(reply, 400, 'ai_test_failed', error instanceof Error ? error.message : 'AI test failed')
    }
  })

  app.post('/ai/recognize-subscription', async (request, reply) => {
    try {
      return sendOk(reply, await recognizeSubscriptionByAi(request.body))
    } catch (error) {
      return sendError(reply, 400, 'ai_recognition_failed', error instanceof Error ? error.message : 'AI recognition failed')
    }
  })
}
