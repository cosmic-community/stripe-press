import { cosmic } from '@/lib/cosmic'
import { addToCart, cartTotal, getCart, setQuantity, type CartLine } from '@/lib/cart'
import { getOrder } from '@/lib/checkout'
import { holdPurchase, publicConfirmation, type PublicConfirmation } from '@/lib/cap-confirm'
import { formatPrice, priceCents } from '@/lib/pricing'

export type ShopIntent = 'checkout' | 'order' | 'view' | 'add' | 'remove'

export type ShopMessage = {
  status: 'done' | 'failed'
  reply?: string
  error?: { code: string; message: string }
  confirmation?: PublicConfirmation
}

type Book = { slug: string; title: string }

const CHECKOUT = /\b(check ?out|place (the |my |an |this )?order|complete (the |my )?(order|purchase)|pay for (it|them|this|that|my|the cart))\b/i
const VIEW = /\b(my cart|what(?:'s| is) in (?:my |the )?cart|show (?:me )?(?:my |the )?cart|view (?:my |the )?cart)\b/i
const ORDER = /\b(my orders?|order status|where is my order)\b/i
const ADD = /\b(add|put)\b/i
const REMOVE = /\b(remove|delete|take out)\b/i
const CART = /\b(cart|basket)\b/i

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && word !== 'the' && word !== 'a' && word !== 'an')
}

function mentions(text: string, title: string): boolean {
  const wanted = words(title)
  if (wanted.length < 2) return false
  const have = new Set(words(text))
  return wanted.every((word) => have.has(word))
}

export function shopIntent(text: string, titles: string[]): ShopIntent | null {
  if (CHECKOUT.test(text)) return 'checkout'
  if (ORDER.test(text)) return 'order'
  if (VIEW.test(text)) return 'view'
  const named = titles.some((title) => mentions(text, title))
  if (REMOVE.test(text) && (CART.test(text) || named)) return 'remove'
  if (ADD.test(text) && (CART.test(text) || named)) return 'add'
  return null
}

export function needsWrite(intent: ShopIntent): boolean {
  return intent === 'checkout' || intent === 'add' || intent === 'remove'
}

async function catalog(): Promise<Book[]> {
  try {
    const response = await cosmic.objects.find({ type: 'book' }).props(['slug', 'title', 'metadata']).limit(100)
    const objects = (response.objects ?? []) as { slug: string; title: string; metadata?: { price?: unknown } }[]
    return objects
      .filter((object) => priceCents(object.metadata?.price) !== null)
      .map((object) => ({ slug: object.slug, title: object.title }))
  } catch {
    return []
  }
}

export async function classifyShop(text: string): Promise<ShopIntent | null> {
  const books = await catalog()
  return shopIntent(text, books.map((book) => book.title))
}

function matchBook(text: string, books: Book[]): Book | 'ambiguous' | null {
  const hits = books.filter((book) => mentions(text, book.title))
  if (hits.length === 1) return hits[0] ?? null
  if (hits.length > 1) return 'ambiguous'
  return null
}

function quantityOf(text: string): number {
  const match = text.match(/\b([1-9]|10)\s*(copies|copy|x|of them)\b/i) || text.match(/\bquantity\s*:?\s*([1-9]|10)\b/i)
  return match ? Number(match[1]) : 1
}

function describeCart(origin: string, items: CartLine[]): string {
  if (!items.length) return `Your cart is empty. The books are at ${origin}/books.`
  const lines = items.map(
    (item) => `${item.quantity} × ${item.title} (${formatPrice(item.unit_cents)}) ${origin}/book/${item.slug}`
  )
  return `Your cart:\n${lines.join('\n')}\nTotal ${formatPrice(cartTotal(items))}, before shipping and tax.`
}

export async function runShop(text: string, account: string, capFrom: string, origin: string): Promise<ShopMessage | null> {
  const books = await catalog()
  const intent = shopIntent(text, books.map((book) => book.title))
  if (!intent) return null

  if (intent === 'view') {
    return { status: 'done', reply: describeCart(origin, await getCart(account)) }
  }

  if (intent === 'order') {
    const slug = text.match(/\border-[a-z0-9-]+\b/i)?.[0]
    if (!slug) {
      return { status: 'done', reply: 'Tell me the order number, for example order-abc123, and I will check it.' }
    }
    const order = await getOrder(slug)
    if (!order || order.customer !== account) {
      return { status: 'done', reply: `I can't find ${slug} on this account.` }
    }
    return {
      status: 'done',
      reply: `Order ${order.slug} is ${order.status}. Total ${formatPrice(order.total_cents)}. ${origin}/orders/${order.slug}`,
    }
  }

  if (intent === 'checkout') {
    const items = await getCart(account)
    if (!items.length) return { status: 'done', reply: `Your cart is empty. The books are at ${origin}/books.` }
    const held = await holdPurchase(account, capFrom, items, origin)
    const confirmation = publicConfirmation(held, origin)
    return {
      status: 'done',
      reply: `Checking out needs your OK: ${confirmation.url}`,
      confirmation,
    }
  }

  const book = matchBook(text, books)
  if (!book || book === 'ambiguous') {
    return { status: 'done', reply: `Which book? ${books.map((item) => item.title).join(', ')}.` }
  }

  if (intent === 'add') {
    const result = await addToCart(account, book.slug, quantityOf(text))
    if (!result.ok) return { status: 'failed', error: { code: result.error, message: result.message } }
    return { status: 'done', reply: describeCart(origin, result.items) }
  }

  const removed = await setQuantity(account, book.slug, 0)
  if (!removed.ok) return { status: 'failed', error: { code: removed.error, message: removed.message } }
  return { status: 'done', reply: describeCart(origin, removed.items) }
}
