import { cosmic, hasStatus } from '@/lib/cosmic'
import { findObject, insertObject, updateMetadata } from '@/lib/cosmic-store'
import { priceCents } from '@/lib/pricing'

export type CartLine = { slug: string; title: string; quantity: number; unit_cents: number }

export type CartResult =
  | { ok: true; items: CartLine[] }
  | { ok: false; status: number; error: string; message: string }

const MAX_QTY = 10

function cartSlug(username: string): string {
  return `cart-${username}`
}

export function parseItems(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is CartLine =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as CartLine).slug === 'string' &&
      typeof (item as CartLine).quantity === 'number' &&
      typeof (item as CartLine).unit_cents === 'number'
  )
}

export async function getCart(username: string): Promise<CartLine[]> {
  const object = await findObject('carts', cartSlug(username))
  return object ? parseItems(object.metadata.items) : []
}

async function saveCart(username: string, items: CartLine[]): Promise<void> {
  const object = await findObject('carts', cartSlug(username))
  if (object) {
    await updateMetadata(object.id, { customer: username, items })
  } else {
    await insertObject('carts', cartSlug(username), `Cart: ${username}`, { customer: username, items })
  }
}

export async function findBook(
  slug: string
): Promise<{ slug: string; title: string; unit_cents: number | null } | null> {
  if (!slug) return null
  try {
    const response = await cosmic.objects.findOne({ type: 'book', slug }).props(['slug', 'title', 'metadata'])
    const object = response.object as { slug: string; title: string; metadata?: { price?: unknown } } | undefined
    if (!object) return null
    return { slug: object.slug, title: object.title, unit_cents: priceCents(object.metadata?.price) }
  } catch (error) {
    if (hasStatus(error) && error.status === 404) return null
    throw error
  }
}

function clampQuantity(value: number): number {
  const quantity = Math.floor(Number(value))
  return Number.isFinite(quantity) ? Math.max(1, Math.min(MAX_QTY, quantity)) : 1
}

export async function addToCart(username: string, bookSlug: string, quantity = 1): Promise<CartResult> {
  const book = await findBook(bookSlug)
  if (!book) {
    return { ok: false, status: 404, error: 'book_not_found', message: `No book with slug "${bookSlug}".` }
  }
  if (book.unit_cents === null) {
    return { ok: false, status: 409, error: 'not_for_sale', message: `${book.title} is not available to order yet.` }
  }
  const unitCents = book.unit_cents
  const add = clampQuantity(quantity)
  const items = await getCart(username)
  const existing = items.find((item) => item.slug === book.slug)
  if (existing) {
    existing.quantity = Math.min(MAX_QTY, existing.quantity + add)
    existing.unit_cents = unitCents
    existing.title = book.title
  } else {
    items.push({ slug: book.slug, title: book.title, quantity: add, unit_cents: unitCents })
  }
  await saveCart(username, items)
  return { ok: true, items }
}

export async function setQuantity(username: string, slug: string, quantity: number): Promise<CartResult> {
  const items = await getCart(username)
  if (!items.some((item) => item.slug === slug)) {
    return { ok: false, status: 404, error: 'not_in_cart', message: `"${slug}" is not in the cart.` }
  }
  const next = Math.floor(Number(quantity))
  if (!Number.isFinite(next) || next < 0) {
    return { ok: false, status: 400, error: 'invalid_quantity', message: 'quantity must be a whole number, 0 or more.' }
  }
  const updated =
    next === 0
      ? items.filter((item) => item.slug !== slug)
      : items.map((item) => (item.slug === slug ? { ...item, quantity: Math.min(MAX_QTY, next) } : item))
  await saveCart(username, updated)
  return { ok: true, items: updated }
}

export async function clearCart(username: string): Promise<void> {
  const object = await findObject('carts', cartSlug(username))
  if (object) await updateMetadata(object.id, { customer: username, items: [] })
}

export function cartTotal(items: CartLine[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_cents, 0)
}

export function cartCount(items: CartLine[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}
