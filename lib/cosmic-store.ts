import { cosmic, hasStatus } from '@/lib/cosmic'
import { sha256 } from '@/lib/crypto-tokens'

// Thin server-only storage layer on top of Cosmic objects.
// Customers, carts, orders and CAP records are stored as drafts so they never
// show up in published queries.

export type StoredObject = {
  id: string
  slug: string
  title: string
  status?: string
  created_at?: string
  metadata: Record<string, unknown>
}

type WriteApi = {
  insertOne(data: Record<string, unknown>): Promise<{ object: StoredObject }>
  updateOne(id: string, data: Record<string, unknown>): Promise<unknown>
  deleteOne(id: string): Promise<unknown>
}

const write = cosmic.objects as unknown as WriteApi

export async function findObject(type: string, slug: string): Promise<StoredObject | null> {
  try {
    const response = await cosmic.objects
      .findOne({ type, slug })
      .props(['id', 'slug', 'title', 'status', 'created_at', 'metadata'])
      .status('any')
    const object = response.object as StoredObject | undefined
    if (!object) return null
    return { ...object, metadata: object.metadata ?? {} }
  } catch (error) {
    if (hasStatus(error) && error.status === 404) return null
    throw error
  }
}

export async function insertObject(
  type: string,
  slug: string,
  title: string,
  metadata: Record<string, unknown>
): Promise<StoredObject> {
  const response = await write.insertOne({ type, slug, title, status: 'draft', metadata })
  return response.object
}

export async function updateMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
  await write.updateOne(id, { metadata })
}

export async function deleteObject(id: string): Promise<void> {
  try {
    await write.deleteOne(id)
  } catch {
    // already gone
  }
}

// Key-value records with optional expiry (used by the OAuth device flow).
type Stored<T> = { data: T; exp?: number }

function kvSlug(key: string): string {
  return `cap-${sha256(key).slice(0, 40)}`
}

function kvPrefix(key: string): string {
  return key.split(':')[0] || 'record'
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const record = await findObject('cap-records', kvSlug(key))
  if (!record) return null
  const value = record.metadata.value as Stored<T> | undefined
  if (!value || value.data === undefined) return null
  if (typeof value.exp === 'number' && value.exp < Date.now() / 1000) {
    await deleteObject(record.id)
    return null
  }
  return value.data
}

export async function kvSet<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
  const value: Stored<T> = { data }
  if (ttlSeconds) value.exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const slug = kvSlug(key)
  const metadata = { record_key: kvPrefix(key), value }
  const existing = await findObject('cap-records', slug)
  if (existing) {
    await updateMetadata(existing.id, metadata)
    return
  }
  await insertObject('cap-records', slug, `${kvPrefix(key)} ${slug.slice(4, 12)}`, metadata)
}

export async function kvDel(key: string): Promise<void> {
  const record = await findObject('cap-records', kvSlug(key))
  if (record) await deleteObject(record.id)
}
