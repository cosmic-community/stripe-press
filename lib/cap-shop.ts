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

type Book = { slug: string; title: string; published: number }

const CHECKOUT = /\b(check ?out|place (the |my |an |this )?order|complete (the |my )?(order|purchase)|pay for (it|them|this|that|my|the cart))\b/i
const VIEW = /\b(my cart|what(?:'s| is) in (?:my |the )?cart|show (?:me )?(?:my |the )?cart|view (?:my |the )?cart)\b/i
const ORDER = /\b(my orders?|order status|where is my order)\b/i
const ADD = /\b(add|put|buy|purchase|get me|send me)\b/i
const WANT = /\bi (?:want|need|'?ll take|'?d like)\b/i
const REMOVE = /\b(remove|delete|take out)\b/i
const CART = /\b(cart|basket)\b/i
const NEWEST = /\b(newest|latest|most recent|just published)\b/i
const THAT = /\b(that|this|the|my|your|same)\s+(book|one|title|copy)\b/i
const ASKING = /^(what|which|who|when|how|why)\b/i

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
  const pointed = named || refersBack(text) || NEWEST.test(text) || CART.test(text)
  const question = ASKING.test(text.trim()) || text.trim().endsWith('?')
  if (REMOVE.test(text) && pointed) return 'remove'
  if (ADD.test(text) && (pointed || !question)) return 'add'
  if (WANT.test(text) && pointed) return 'add'
  if (/\border\b/i.test(text) && (named || NEWEST.test(text) || refersBack(text))) return 'add'
  return null
}

function refersBack(text: string): boolean {
  if (THAT.test(text)) return true
  return /\bit\b/i.test(text) && text.trim().split(/\s+/).length <= 8
}

export function needsWrite(intent: ShopIntent): boolean {
  return intent === 'checkout' || intent === 'add' || intent === 'remove'
}

async function catalog(): Promise<Book[]> {
  try {
    const response = await cosmic.objects
      .find({ type: 'book' })
      .props(['slug', 'title', 'metadata', 'created_at', 'published_at'])
      .limit(100)
    const objects = (response.objects ?? []) as {
      slug: string
      title: string
      metadata?: { price?: unknown }
      created_at?: string | null
      published_at?: string | null
    }[]
    return objects
      .filter((object) => priceCents(object.metadata?.price) !== null)
      .map((object) => {
        const raw = object.published_at || object.created_at
        const published = raw ? Date.parse(raw) : 0
        return { slug: object.slug, title: object.title, published: Number.isNaN(published) ? 0 : published }
      })
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

function newestBook(books: Book[]): Book | null {
  const dated = books.filter((book) => book.published > 0)
  if (!dated.length) return null
  return dated.reduce((latest, book) => (book.published > latest.published ? book : latest))
}

// A named title wins. "Newest" is the latest book. "That" uses the previous reply.
function resolveBook(text: string, books: Book[], context: string): Book | 'ambiguous' | null {
  const direct = matchBook(text, books)
  if (direct) return direct
  if (NEWEST.test(text)) return newestBook(books) ?? 'ambiguous'
  if (refersBack(text) && context) return matchBook(context, books)
  return null
}

function whichBook(books: Book[]): string {
  return `Which book? ${books.map((item) => item.title).join(', ')}.`
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

export async function runShop(
  text: string,
  account: string,
  capFrom: string,
  origin: string,
  context = ''
): Promise<ShopMessage | null> {
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
    const requested = resolveBook(text, books, context)
    if (requested === 'ambiguous') return { status: 'done', reply: `I did not check out. ${whichBook(books)}` }
    if (requested && !items.some((item) => item.slug === requested.slug)) {
      const cart = items.length ? items.map((item) => item.title).join(', ') : 'empty'
      return {
        status: 'done',
        reply: `I did not check out. You asked for ${requested.title}, and the cart is ${cart}. Nothing was held. Ask me to add ${requested.title} first.`,
      }
    }
    if (requested && items.some((item) => item.slug !== requested.slug)) {
      const extra = items.filter((item) => item.slug !== requested.slug).map((item) => item.title).join(', ')
      return {
        status: 'done',
        reply: `I did not check out. The cart also has ${extra}, so this would buy more than ${requested.title}. Ask me to remove ${extra} first.`,
      }
    }
    if (!items.length) return { status: 'done', reply: `Your cart is empty. The books are at ${origin}/books.` }
    const held = await holdPurchase(account, capFrom, items, origin)
    const confirmation = publicConfirmation(held, origin)
    const names = items.map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.title}` : item.title)).join(', ')
    return {
      status: 'done',
      reply: `Checking out ${names} for ${formatPrice(cartTotal(items))}, before shipping and tax. This needs your OK: ${confirmation.url}`,
      confirmation,
    }
  }

  const book = resolveBook(text, books, context)
  if (!book || book === 'ambiguous') {
    return { status: 'done', reply: whichBook(books) }
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
