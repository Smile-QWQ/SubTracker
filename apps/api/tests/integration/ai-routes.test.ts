import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiRoutes } from '../../src/routes/ai'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

describe('ai routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()
    await aiRoutes(app)
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await app.close()
  })

  it('tests connection with override payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: 'OK'
              }
            }
          ]
        })
      )
    )

    const res = await app.inject({
      method: 'POST',
      url: '/ai/test',
      payload: {
        enabled: true,
        providerName: '阿里百炼',
        providerPreset: 'aliyun-bailian',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'token',
        model: 'qwen3-vl-plus',
        timeoutMs: 30000,
        capabilities: {
          vision: true,
          structuredOutput: true
        }
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.providerName).toBe('阿里百炼')
  })

  it('tests vision endpoint with image_url payload', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '已收到图片'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await app.inject({
      method: 'POST',
      url: '/ai/test-vision',
      payload: {
        enabled: true,
        providerName: '腾讯混元',
        providerPreset: 'tencent-hunyuan',
        baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        apiKey: 'token',
        model: 'hunyuan-vision',
        timeoutMs: 30000,
        capabilities: {
          vision: true,
          structuredOutput: true
        }
      }
    })

    expect(res.statusCode).toBe(200)
    const requestBody = JSON.parse(String(((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1]?.body))
    expect(requestBody.messages[1].content[1].type).toBe('image_url')
  })

  it('rejects vision test when vision capability is disabled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ai/test-vision',
      payload: {
        enabled: true,
        providerName: '自定义',
        providerPreset: 'custom',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'token',
        model: 'deepseek-chat',
        timeoutMs: 30000,
        capabilities: {
          vision: false,
          structuredOutput: true
        }
      }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('视觉输入能力')
  })
})
