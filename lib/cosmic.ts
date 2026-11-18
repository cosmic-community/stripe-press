import { cache } from 'react'
import { createBucketClient } from '@cosmicjs/sdk'
import { getCosmic } from '@/lib/cosmic-preview'
import { titleSortKey } from '@/lib/format'
import type { Book, CosmicObject, Page } from '@/types'

// Write client (server-side only). Page-rendering reads use getCosmic() below.
export const cosmic = createBucketClient({
  bucketSlug: process.env.COSMIC_BUCKET_SLUG as string,
  readKey: process.env.COSMIC_READ_KEY as string,
  writeKey: process.env.COSMIC_WRITE_KEY as string,
})

// Simple error helper for Cosmic SDK errors
export function hasStatus(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && 'status' in error
}

// Safely turn any metadata value (string, number, {key, value}) into a string
export function getMetafieldValue(field: unknown): string {
  if (field === null || field === undefined) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'number' || typeof field === 'boolean') return String(field)
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return String((field as { value: unknown }).value)
  }
  if (typeof field === 'object' && field !== null && 'key' in field) {
    return String((field as { key: unknown }).key)
  }
  return ''
}

export function getDateValue(item: {
  published_at?: string | null
  modified_at?: string | null
  created_at?: string | null
}): number {
  const raw = item.published_at || item.modified_at || item.created_at
  const time = raw ? Date.parse(raw) : NaN
  return Number.isNaN(time) ? 0 : time
}

const PROPS = [
  'id',
  'slug',
  'title',
  'type',
  'content',
  'metadata',
  'created_at',
  'modified_at',
  'published_at',
]

async function fetchAll<T extends CosmicObject>(type: 'book' | 'page'): Promise<T[]> {
  const { cosmic: client, previewToken } = await getCosmic()
  try {
    const query = client.objects.find({ type }).props(PROPS).depth(1).limit(100)
    const response = previewToken ? await query.status('any') : await query
    return (response.objects ?? []) as T[]
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return []
    }
    throw new Error(`Failed to fetch ${type} objects`)
  }
}

async function fetchOne<T extends CosmicObject>(
  type: 'book' | 'page',
  slug: string
): Promise<T | null> {
  const { cosmic: client, previewToken } = await getCosmic()
  try {
    const query = client.objects.findOne({ type, slug }).props(PROPS).depth(1)
    const response = previewToken ? await query.status('any') : await query
    const object = response.object as T | undefined
    return object ?? null
  } catch (error) {
    if (hasStatus(error) && error.status === 404) {
      return null
    }
    throw new Error(`Failed to fetch ${type} "${slug}"`)
  }
}

// Alphabetical (ignoring leading articles)
export const getBooks = cache(async (): Promise<Book[]> => {
  const books = await fetchAll<Book>('book')
  return books.sort((a, b) => titleSortKey(a.title).localeCompare(titleSortKey(b.title)))
})

export const getBookBySlug = cache(async (slug: string): Promise<Book | null> => {
  return fetchOne<Book>('book', slug)
})

export const getPages = cache(async (): Promise<Page[]> => {
  const pages = await fetchAll<Page>('page')
  return pages.sort((a, b) => a.slug.localeCompare(b.slug))
})

export const getPageBySlug = cache(async (slug: string): Promise<Page | null> => {
  return fetchOne<Page>('page', slug)
})