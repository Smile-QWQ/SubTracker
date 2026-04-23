import { describe, expect, it, vi } from 'vitest'
import { createSingleFlight } from '@/utils/single-flight'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createSingleFlight', () => {
  it('coalesces repeated concurrent calls into a single request', async () => {
    const task = deferred<string>()
    const worker = vi.fn(async (value: string) => task.promise)
    const singleFlight = createSingleFlight(worker)

    const first = singleFlight.run('save')
    const second = singleFlight.run('save')

    expect(singleFlight.pending).toBe(true)
    expect(worker).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)

    task.resolve('done')

    await expect(first).resolves.toBe('done')
    expect(singleFlight.pending).toBe(false)
  })

  it('allows a new call after the previous one settles', async () => {
    const worker = vi.fn(async (value: string) => value)
    const singleFlight = createSingleFlight(worker)

    await expect(singleFlight.run('first')).resolves.toBe('first')
    await expect(singleFlight.run('second')).resolves.toBe('second')

    expect(worker).toHaveBeenCalledTimes(2)
  })
})
