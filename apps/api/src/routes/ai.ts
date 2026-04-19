import { FastifyInstance } from 'fastify'
import { AiConfigSchema, DEFAULT_AI_CONFIG, type AiConfigInput } from '@subtracker/shared'
import { sendError, sendOk } from '../http'
import { recognizeSubscriptionByAi, testAiConnection, testAiVisionConnection } from '../services/ai.service'

function normalizeAiConfigPayload(payload: Partial<AiConfigInput>) {
  return AiConfigSchema.parse({
    ...DEFAULT_AI_CONFIG,
    ...payload,
    capabilities: {
      ...DEFAULT_AI_CONFIG.capabilities,
      ...payload.capabilities
    }
  })
}

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
          await testAiConnection(normalizeAiConfigPayload(parsed.data))
        )
      }

      return sendOk(reply, await testAiConnection())
    } catch (error) {
      return sendError(reply, 400, 'ai_test_failed', error instanceof Error ? error.message : 'AI test failed')
    }
  })

  app.post('/ai/test-vision', async (request, reply) => {
    try {
      if (request.body) {
        const parsed = AiConfigSchema.partial().safeParse(request.body)
        if (!parsed.success) {
          return sendError(reply, 422, 'validation_error', 'Invalid AI config payload', parsed.error.flatten())
        }
        return sendOk(reply, await testAiVisionConnection(normalizeAiConfigPayload(parsed.data)))
      }

      return sendOk(reply, await testAiVisionConnection())
    } catch (error) {
      return sendError(reply, 400, 'ai_vision_test_failed', error instanceof Error ? error.message : 'AI vision test failed')
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
