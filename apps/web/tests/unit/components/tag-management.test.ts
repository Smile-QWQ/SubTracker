import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readComponent(path: string) {
  return readFileSync(path, 'utf8')
}

describe('tag management simplification', () => {
  it('does not keep tag icon selector or preview in the tag form', () => {
    const source = readComponent('src/components/TagFormModal.vue')

    expect(source).not.toContain('label="图标"')
    expect(source).not.toContain('图标预览')
    expect(source).not.toContain('renderIconOption')
    expect(source).not.toContain('selectedIcon')
  })

  it('does not render tag icon values in the management table', () => {
    const source = readComponent('src/components/TagManageModal.vue')

    expect(source).not.toContain('row.icon')
    expect(source).not.toContain('resolveTagIcon')
    expect(source).not.toContain('film-outline')
  })
})
