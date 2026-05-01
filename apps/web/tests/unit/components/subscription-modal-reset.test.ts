import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { NMessageProvider } from 'naive-ui'
import SubscriptionFormModal from '../../../src/components/SubscriptionFormModal.vue'

vi.mock('@vueuse/core', () => ({
  useWindowSize: () => ({ width: { value: 1200 } })
}))

vi.mock('../../../src/composables/api', () => ({
  api: {
    getSettings: vi.fn(async () => ({
      baseCurrency: 'CNY',
      timezone: 'Asia/Shanghai'
    }))
  }
}))

function readComponent(path: string) {
  return readFileSync(path, 'utf8')
}

describe('subscription modal reset behavior', () => {
  it('clears editing state when the subscription modal closes', () => {
    const source = readComponent('src/pages/SubscriptionsPage.vue')

    expect(source).toContain('function closeModal()')
    expect(source).toContain('showModal.value = false')
    expect(source).toContain('editing.value = null')
  })

  it('resets the create form when the modal closes', () => {
    const source = readComponent('src/components/SubscriptionFormModal.vue')

    expect(source).toContain("() => props.show")
    expect(source).toContain('if (!props.model) {')
    expect(source).toContain('resetForm()')
  })

  it('resets entered create-form values after the modal is closed and reopened', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })

    const Host = defineComponent({
      setup() {
        const show = ref(true)
        return { show }
      },
      render() {
        return h(NMessageProvider, null, {
          default: () =>
            h(SubscriptionFormModal, {
              show: this.show,
              model: null,
              saving: false,
              tags: [],
              currencies: ['CNY', 'USD']
            })
        })
      }
    })

    const wrapper = mount(
      Host,
      {
        global: {
          plugins: [[VueQueryPlugin, { queryClient }]],
          stubs: {
            teleport: true,
            transition: false,
            'subscription-ai-modal': true
          }
        }
      }
    )

    await flushPromises()
    const inputs = wrapper.findAll('input')
    const nameInput = inputs[0]
    await nameInput.setValue('GitHub Pro')

    wrapper.vm.show = false
    await nextTick()
    await flushPromises()
    wrapper.vm.show = true
    await nextTick()
    await flushPromises()

    expect((wrapper.findAll('input')[0].element as HTMLInputElement).value).toBe('')
  })
})
