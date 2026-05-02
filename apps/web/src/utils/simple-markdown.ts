import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true
})

export function renderMarkdownToHtml(markdown: string) {
  const normalized = String(markdown ?? '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  const rendered = marked.parse(normalized, { async: false })
  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true }
  })
}
