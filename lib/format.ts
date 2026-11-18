// Sort key that ignores leading articles ("The Dream Machine" -> "dream machine")
export function titleSortKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
}

export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input
  return `${input.slice(0, max - 1).trimEnd()}…`
}

// Derive a short "author line" from the SEO description
export function deriveByline(description?: string): string {
  const text = stripHtml(description ?? '')
  if (!text) return ''
  const match = text.match(/\bby\s+([A-Z][^.,;:—–\n]{1,60})/)
  if (match && match[1]) {
    return match[1].trim()
  }
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text
  return truncate(firstSentence, 70)
}

// Append imgix params to an imgix_url (which is already fully qualified)
export function imgixUrl(url: string | undefined, params: string): string {
  if (!url) return ''
  return `${url}${url.includes('?') ? '&' : '?'}${params}`
}

// Utility pages are shown in the footer rather than the "Websites" list
const UTILITY_ORDER = ['faq', 'terms', 'privacy']

export function isUtilityPage(slug: string): boolean {
  return /^(faq|terms|privacy)/i.test(slug)
}

export function utilityRank(slug: string): number {
  const lower = slug.toLowerCase()
  const index = UTILITY_ORDER.findIndex((prefix) => lower.startsWith(prefix))
  return index === -1 ? UTILITY_ORDER.length : index
}