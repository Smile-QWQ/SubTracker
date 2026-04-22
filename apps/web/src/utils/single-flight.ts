export function createSingleFlight<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>
) {
  let inflight: Promise<TResult> | null = null

  return {
    get pending() {
      return inflight !== null
    },
    run(...args: TArgs) {
      if (inflight) {
        return inflight
      }

      inflight = Promise.resolve(fn(...args)).finally(() => {
        inflight = null
      })

      return inflight
    }
  }
}
