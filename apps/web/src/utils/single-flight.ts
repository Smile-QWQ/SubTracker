import { ref } from 'vue'

export function createSingleFlight<TArgs extends unknown[], TResult>(worker: (...args: TArgs) => Promise<TResult>) {
  const pending = ref(false)
  let inflight: Promise<TResult> | null = null

  return {
    get pending() {
      return pending.value
    },
    run(...args: TArgs) {
      if (inflight) {
        return inflight
      }

      pending.value = true
      inflight = worker(...args).finally(() => {
        inflight = null
        pending.value = false
      })

      return inflight
    }
  }
}
