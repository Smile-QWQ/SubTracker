import { describe, expect, it } from 'vitest'
import { renderMarkdownToHtml } from '@/utils/simple-markdown'

describe('markdown renderer', () => {
  it('renders headings, lists and paragraphs safely', () => {
    const html = renderMarkdownToHtml(`## 总览

- 第一条
- 第二条

正文 **加粗** 与 *强调* 以及 \`code\`
<script>alert(1)</script>`)

    expect(html).toContain('<h2>总览</h2>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>第一条</li>')
    expect(html).toContain('<li>第二条</li>')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<em>强调</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert(1)')
  })
})
