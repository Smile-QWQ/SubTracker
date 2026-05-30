import { beforeEach, describe, expect, it, vi } from 'vitest'

const { postMock, getMock, requestUseMock, responseUseMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
  requestUseMock: vi.fn(),
  responseUseMock: vi.fn()
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: postMock,
      get: getMock,
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: {
          use: requestUseMock
        },
        response: {
          use: responseUseMock
        }
      }
    }))
  }
}))

vi.mock('@/utils/auth-storage', () => ({
  clearAuthSession: vi.fn(),
  getStoredToken: vi.fn(() => null)
}))

vi.mock('@/utils/api-base', () => ({
  getApiBaseUrl: vi.fn(() => '/api')
}))

vi.mock('@/utils/api-error', () => ({
  normalizeApiErrorMessage: vi.fn((error: { message?: string }) => error.message || '请求失败')
}))

import { api } from '../../../src/composables/api'

describe('api dashboard summary timeout', () => {
  beforeEach(() => {
    postMock.mockReset()
    getMock.mockReset()
    requestUseMock.mockReset()
    responseUseMock.mockReset()
  })

  it('uses a dedicated longer timeout when generating dashboard summary', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        data: {
          scope: 'dashboard-overview',
          status: 'success',
          content: '## 总览',
          previewContent: '总览',
          errorMessage: null,
          generatedAt: '2026-05-04T00:00:00.000Z',
          updatedAt: '2026-05-04T00:00:00.000Z',
          sourceDataHash: 'hash',
          fromCache: false,
          isStale: false,
          canGenerate: true,
          needsGeneration: false
        }
      }
    })

    await api.generateDashboardAiSummary()

    expect(postMock).toHaveBeenCalledWith(
      '/ai/summary/dashboard/generate',
      undefined,
      expect.objectContaining({
        timeout: 65000
      })
    )
  })
})
