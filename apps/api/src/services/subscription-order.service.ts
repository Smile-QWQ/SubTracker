import { getSetting, setSetting } from './settings.service'

const SUBSCRIPTION_ORDER_KEY = 'subscriptionOrder'

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)))
}

export async function getSubscriptionOrder() {
  return uniqueIds(await getSetting<string[]>(SUBSCRIPTION_ORDER_KEY, []))
}

export async function setSubscriptionOrder(ids: string[]) {
  await setSetting(SUBSCRIPTION_ORDER_KEY, uniqueIds(ids))
}

export async function appendSubscriptionOrder(id: string) {
  const current = await getSubscriptionOrder()
  if (!current.includes(id)) {
    current.push(id)
    await setSubscriptionOrder(current)
  }
}

export async function appendSubscriptionOrders(ids: string[]) {
  const normalized = uniqueIds(ids)
  if (normalized.length === 0) return

  const current = await getSubscriptionOrder()
  const existing = new Set(current)
  const appended = normalized.filter((id) => !existing.has(id))
  if (appended.length === 0) return

  await setSubscriptionOrder([...current, ...appended])
}

export async function removeSubscriptionOrder(id: string) {
  const current = await getSubscriptionOrder()
  await setSubscriptionOrder(current.filter((item) => item !== id))
}

export async function sortSubscriptionsByOrder<T extends { id: string }>(rows: T[]) {
  const order = await getSubscriptionOrder()
  const orderIndex = new Map(order.map((id, index) => [id, index]))

  return [...rows].sort((a, b) => {
    const aIndex = orderIndex.get(a.id)
    const bIndex = orderIndex.get(b.id)

    if (aIndex === undefined && bIndex === undefined) return 0
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}
