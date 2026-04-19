import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AI_CONFIG } from '@subtracker/shared'

const mockedSettings = {
  aiConfig: {
    ...DEFAULT_AI_CONFIG,
    enabled: true,
    apiKey: 'test-key',
    capabilities: {
      ...DEFAULT_AI_CONFIG.capabilities
    }
  }
}

const recognizeMock = vi.fn(async () => ({
  data: {
    text: 'OCR invoice text'
  }
}))

vi.mock('../../src/services/settings.service', () => ({
  getAppSettings: vi.fn(async () => mockedSettings)
}))

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => ({
    recognize: recognizeMock
  }))
}))

import { recognizeSubscriptionByAi, testAiConnection } from '../../src/services/ai.service'

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
    recognizeMock.mockClear()
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
    const firstBody = JSON.parse(String((((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1])?.body))
    const secondBody = JSON.parse(String((((fetchMock.mock.calls[1] as unknown) as [unknown, RequestInit])[1])?.body))
    expect(firstBody.response_format).toEqual({ type: 'json_object' })
    expect(secondBody.response_format).toBeUndefined()
    expect(secondBody.messages[0].content).toContain('合法 JSON 对象')
  })

  it('uses OCR text path when vision capability is disabled', async () => {
    mockedSettings.aiConfig.capabilities.vision = false

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '{"name":"OCR Result"}'
            }
          }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await recognizeSubscriptionByAi({
      imageBase64: 'dGVzdA==',
      mimeType: 'image/png'
    })

    expect(result.name).toBe('OCR Result')
    expect(recognizeMock).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(String((((fetchMock.mock.calls[0] as unknown) as [unknown, RequestInit])[1])?.body))
    expect(typeof requestBody.messages[1].content).toBe('string')
    expect(requestBody.messages[1].content).toContain('OCR 提取文本')
  })
})
