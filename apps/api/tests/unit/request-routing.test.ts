import { describe, expect, it } from 'vitest'
import { requiresWorkerRuntimeContext } from '../../src/worker/request-routing'

describe('requiresWorkerRuntimeContext', () => {
  it('marks api and managed logo routes as runtime-bound', () => {
    expect(requiresWorkerRuntimeContext('/api/v1/settings')).toBe(true)
    expect(requiresWorkerRuntimeContext('/static/logos/subtracker/logo.png')).toBe(true)
  })

  it('skips pure assets and public shell routes', () => {
    expect(requiresWorkerRuntimeContext('/')).toBe(false)
    expect(requiresWorkerRuntimeContext('/login')).toBe(false)
    expect(requiresWorkerRuntimeContext('/assets/index.js')).toBe(false)
    expect(requiresWorkerRuntimeContext('/favicon.ico')).toBe(false)
    expect(requiresWorkerRuntimeContext('/health')).toBe(false)
  })
})
