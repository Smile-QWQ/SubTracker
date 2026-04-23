import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AI_CONFIG, type AiConfigInput } from '@subtracker/shared'

const mockedSettings: {
  aiConfig: AiConfigInput
} = {
  aiConfig: {
    ...DEFAULT_AI_CONFIG,
    enabled: true,
    apiKey: 'test-key',
    capabilities: {
      ...DEFAULT_AI_CONFIG.capabilities
    }
  }
}

vi.mock('../../src/services/settings.service', () => ({
  getAiConfig: vi.fn(async () => mockedSettings.aiConfig)
}))

import { recognizeSubscriptionByAi, testAiConnection, testAiVisionConnection } from '../../src/services/ai.service'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

describe('ai service', () => {
  beforeEach(() => {
    mockedSettings.aiConfig = {
      ...DEFAULT_AI_CONFIG,
      enabled: true,
      apiKey: 'test-key',
      capabilities: {
        ...DEFAULT_AI_CONFIG.capabilities
      }
    }
    vi.restoreAllMocks()
  })

  it('normalizes content blocks from chat completions', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: [{ type: 'text', text: 'OK' }]
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testAiConnection(mockedSettings.aiConfig)

    expect(result.response).toBe('OK')
  })

  it('allows connection test even when AI recognition is disabled', async () => {
    mockedSettings.aiConfig.enabled = false

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

    const result = await testAiConnection(mockedSettings.aiConfig)

    expect(result.response).toBe('OK')
  })

  it('trims connection test response to stay aligned with main behavior', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '  OK  \n'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testAiConnection(mockedSettings.aiConfig)

    expect(result.response).toBe('OK')
  })

  it('keeps main connection-test prompt and allows disabled config without override', async () => {
    mockedSettings.aiConfig.enabled = false

    const fetchMock = vi.fn(async () =>
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
    vi.stubGlobal('fetch', fetchMock)

    const result = await testAiConnection()
    const requestBody = JSON.parse(String(((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1]?.body))

    expect(result.response).toBe('OK')
    expect(requestBody.messages).toEqual([
      {
        role: 'system',
        content: '请只返回 OK'
      },
      {
        role: 'user',
        content: 'ping'
      }
    ])
  })

  it('keeps main vision-test prompt wording', async () => {
    mockedSettings.aiConfig.capabilities.vision = true

    const fetchMock = vi.fn(async () =>
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
    vi.stubGlobal('fetch', fetchMock)

    const result = await testAiVisionConnection(mockedSettings.aiConfig)
    const requestBody = JSON.parse(String(((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1]?.body))

    expect(result.response).toBe('OK')
    expect(requestBody.messages[0]).toEqual({
      role: 'system',
      content: '请根据用户发送的图片进行响应，只返回一句简短确认。'
    })
    expect((requestBody.messages[1].content as Array<{ type: string; text?: string }>)[0]).toEqual({
      type: 'text',
      text: '请确认你已成功接收到这张测试图片。'
    })
  })

  it('falls back to prompt-only JSON when response_format is unsupported', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('response_format json_object is not supported', { status: 400 }))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [
            {
              message: {
                content: '{"name":"Netflix"}'
              }
            }
          ]
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await recognizeSubscriptionByAi({
      text: 'Netflix 9.99 USD monthly'
    })

    expect(result.name).toBe('Netflix')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns a clear error when image-only recognition is requested without vision support', async () => {
    mockedSettings.aiConfig.capabilities.vision = false

    await expect(
      recognizeSubscriptionByAi({
        imageBase64: 'dGVzdA==',
        mimeType: 'image/png'
      })
    ).rejects.toThrow('当前模型未开启视觉输入，Cloudflare Worker 版本已移除本地 OCR')
  })

  it('falls back to text-only recognition when vision API is unsupported but text exists', async () => {
    mockedSettings.aiConfig = {
      ...mockedSettings.aiConfig,
      capabilities: {
        vision: true,
        structuredOutput: true
      }
    }

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unknown variant 'image_url'", { status: 400 }))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [
            {
              message: {
                content: '{"name":"Recovered From Text"}'
              }
            }
          ]
        })
      )

    vi.stubGlobal('fetch', fetchMock)

    const result = await recognizeSubscriptionByAi({
      text: 'Recovered From Text',
      imageBase64: 'dGVzdA==',
      mimeType: 'image/png'
    })

    expect(result.name).toBe('Recovered From Text')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
