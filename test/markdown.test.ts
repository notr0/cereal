import { describe, expect, it } from 'vitest'
import { enhancedHtml, mdToHtml } from '../src/renderer/src/lib/markdown'

describe('mdToHtml', () => {
  it('shows raw HTML from the model as text', () => {
    const html = mdToHtml('hi <img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('enhancedHtml', () => {
  it('marks AI-written bullets and leaves the user’s own points in full ink', () => {
    const html = enhancedHtml('### Decisions\n- Ship the beta on Friday\n- Budget approved for hiring', 'ship the beta friday')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const items = Array.from(doc.querySelectorAll('li'))
    expect(items[0].querySelector('[data-ai]')).toBeNull()
    expect(items[1].querySelector('[data-ai]')).not.toBeNull()
  })
})
