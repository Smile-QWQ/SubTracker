import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatCard from '@/components/StatCard.vue'

describe('StatCard', () => {
  it('renders value and label', () => {
    const wrapper = mount(StatCard, {
      props: {
        label: '活跃订阅',
        value: 12
      }
    })

    expect(wrapper.text()).toContain('活跃订阅')
    expect(wrapper.text()).toContain('12')
  })
})
