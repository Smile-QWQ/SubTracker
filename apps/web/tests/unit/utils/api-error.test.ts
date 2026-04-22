import { describe, expect, it } from 'vitest'
import { normalizeApiErrorMessage } from '@/utils/api-error'

describe('normalizeApiErrorMessage', () => {
  it('converts worker cpu limit errors to a clearer Worker limit hint', () => {
    expect(
      normalizeApiErrorMessage({
        message: 'Worker exceeded CPU time limit.',
        response: {
          status: 503
        }
      })
    ).toContain('Cloudflare Worker 免费版限制')
  })

  it('adds a Worker limit hint for generic 503 errors', () => {
    expect(
      normalizeApiErrorMessage({
        message: 'Request failed with status code 503',
        response: {
          status: 503
        }
      })
    ).toContain('服务暂时不可用')
  })

  it('keeps non-503 errors unchanged', () => {
    expect(
      normalizeApiErrorMessage({
        message: '字段校验失败',
        response: {
          status: 400
        }
      })
    ).toBe('字段校验失败')
  })
})
