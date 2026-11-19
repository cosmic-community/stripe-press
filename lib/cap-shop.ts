import { cosmic } from '@/lib/cosmic'
import { addToCart, cartTotal, getCart, setQuantity, type CartLine } from '@/lib/cart'
import { getOrder } from '@/lib/checkout'
import {
  confirmUrl,
  effectiveStatus,
  findConfirmation,
  holdPurchase,
  latestConfirmation,
  publicConfirmation,
  type ConfirmationRecord,
  type PublicConfirmation,
} from '@/lib/cap-confirm'
import { formatPrice, priceCents } from '@/lib/pricing'

export type ShopIntent = 'checkout' | 'order' | 'view' | 'add' | 'remove' | 'quantity' | 'status' | 'newest' | 'catalog'

export type CatalogItem = {
  type: 'product'
  ref: number
  id: string
  title: string
  url: string
  price: { amount: string; currency: 'USD' }
  price_note: string
  availability: 'in_stock'
  options: { format: string }
  schema: string
  valid_until: string
}

export type ShopMessage = {
  status: 'done' | 'failed'
  reply?: string
  error?: { code: string; message: string }
  confirmation?: PublicConfirmation
  items?: CatalogItem[]
  as_of?: string
}

type Book = { slug: string; title: string; released: string | null; cents: number }

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
const STATUS_OPENER = /^(what|did|is|was|has|have|does|do|why|how)\b/i
const STATUS_ABOUT = /\b(check ?outs?|orders?|confirmations?|approvals?)\b/i
const STATUS_WORD = /\b(status|go through|went through|gone through|approved|approval|paid|expire[ds]?|waiting|placed|charged|pending|denied|happen(?:ed)?)\b/i
const COUNT_N = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|single)'
const COUNT = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|single|a|an)'
const SET_QUANTITY = new RegExp(
  `\\b(?:(?:set|change|update|make|reduce|lower|decrease|increase|drop|bring)\\b.*\\b(?:to|at)\\s+${COUNT_N}\\b|(?:only|just|exactly)\\s+(?:(?:want|need|get)\\s+)?${COUNT}\\s+(?:cop(?:y|ies)|of (?:it|them|that))|quantity\\s*(?:to|of|:|=)?\\s*${COUNT_N}\\b)`,
  'i'
)
const COPYISH = /\b(cop(?:y|ies)|duplicates?|extras?|one of (?:them|those|the))\b/i
const MORE = /\b(another|one more|an? extra|additional|more)\b/i
const PRICE = /\b(prices?|costs?|how much|priced)\b/i
const LIST = /\b(lists?|catalog|catalogue|inventory|selection|lineup|what books|which books|books do you|for sale|in stock)\b/i
const MANY = /\b(all|every|entire|whole|full|complete|each)\b/i
const BOOKS = /\b(books?|titles?)\b/i
const PRICE_NOTE = 'Hardcover, free shipping, no tax. This price is the total.'
const NUMBERS: Record<string, number> = {
  a: 1, an: 1, single: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

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

function isStatusQuestion(text: string): boolean {
  const trimmed = text.trim()
  const question = STATUS_OPENER.test(trimmed) || trimmed.endsWith('?')
  if (!question || !STATUS_ABOUT.test(trimmed)) return false
  if (STATUS_WORD.test(trimmed)) return true
  if (/\b(add|buy|purchase|place|start|complete|pay)\b/i.test(trimmed)) return false
  if (CHECKOUT.test(trimmed) && !STATUS_OPENER.test(trimmed)) return false
  return true
}

function isNewestQuestion(text: string): boolean {
  const trimmed = text.trim()
  const question = ASKING.test(trimmed) || trimmed.endsWith('?')
  return question && NEWEST.test(trimmed) && !ADD.test(trimmed) && !CHECKOUT.test(trimmed)
}

function isCatalog(text: string, titles: string[]): boolean {
  if (CHECKOUT.test(text) || REMOVE.test(text) || SET_QUANTITY.test(text)) return false
  if (VIEW.test(text) && CART.test(text)) return false
  const named = titles.some((title) => mentions(text, title))
  if (PRICE.test(text) || LIST.test(text)) return true
  if (named) return false
  if (MANY.test(text) && BOOKS.test(text)) return true
  return /\b(?:show|see|browse|tell me)(?: me)? (?:all |the |your |every )?(?:books?|titles?)\b/i.test(text) || /\bwhat do you (?:sell|have|publish|offer)\b/i.test(text)
}

export function shopIntent(text: string, titles: string[]): ShopIntent | null {
  if (isStatusQuestion(text)) return 'status'
  if (isNewestQuestion(text)) return 'newest'
  if (isCatalog(text, titles)) return 'catalog'
  const named = titles.some((title) => mentions(text, title))
  const pointed = named || refersBack(text) || NEWEST.test(text) || CART.test(text)
  if (SET_QUANTITY.test(text)) return 'quantity'
  if (REMOVE.test(text) && (pointed || COPYISH.test(text))) return 'remove'
  if (CHECKOUT.test(text)) return 'checkout'
  if (ORDER.test(text)) return 'order'
  if (VIEW.test(text) && !ADD.test(text)) return 'view'
  const question = ASKING.test(text.trim()) || text.trim().endsWith('?')
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
  return intent === 'checkout' || intent === 'add' || intent === 'remove' || intent === 'quantity'
}

export function needsAccount(intent: ShopIntent): boolean {
  return intent !== 'newest' && intent !== 'catalog'
}

async function catalog(): Promise<Book[]> {
  try {
    const response = await cosmic.objects.find({ type: 'book' }).props(['slug', 'title', 'metadata']).limit(100)
    const objects = (response.objects ?? []) as {
      slug: string
      title: string
      metadata?: { price?: unknown; release_date?: unknown }
    }[]
    return objects
      .flatMap((object) => {
        const cents = priceCents(object.metadata?.price)
        if (cents === null) return []
        return [{ slug: object.slug, title: object.title, released: releaseDate(object.metadata?.release_date), cents }]
      })
  } catch {
    return []
  }
}

// The hosted concierge only sees the message, and that field is capped at 2000
// characters. Fit as many priced books as the caller's text leaves room for.
export async function catalogNote(origin: string, budget: number): Promise<string> {
  if (budget < 80) return ''
  const books = await catalog()
  const header =
    'Stripe Press catalog. Hardcover. The price is the total: free shipping, no tax. Use this list for any question about the books or their prices. Do not ask the customer to sign in to see a price.\n'
  let note = header
  for (const book of [...books].sort((a, b) => a.title.localeCompare(b.title))) {
    const line = `${book.title} ${formatPrice(book.cents)} ${origin}/book/${book.slug}\n`
    if (note.length + line.length > budget) break
    note += line
  }
  return note === header ? '' : note.trimEnd()
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

function releaseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const day = value.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) ? day : null
}

// Release dates come from the book's release_date field. Upload dates are not release dates.
function newestBook(books: Book[]): Book | null {
  const dated = books.filter((book) => book.released)
  if (!dated.length) return null
  return dated.reduce((latest, book) => ((book.released ?? '') > (latest.released ?? '') ? book : latest))
}

const NO_DATES = 'Release dates are not listed for these books, so I cannot tell which is newest. Name a book and I will use that one.'

// A named title wins. "Newest" is the latest release. "That" uses the previous reply.
function resolveBook(text: string, books: Book[], context: string): Book | 'ambiguous' | 'undated' | null {
  const direct = matchBook(text, books)
  if (direct) return direct
  if (NEWEST.test(text)) return newestBook(books) ?? 'undated'
  if (refersBack(text) && context) return matchBook(context, books)
  return null
}

function whichBook(books: { title: string }[]): string {
  return `Which book? ${books.map((item) => item.title).join(', ')}.`
}

function countWord(word: string | undefined): number | null {
  if (!word) return null
  const value = /^\d+$/.test(word) ? Number(word) : NUMBERS[word.toLowerCase()]
  return value && value >= 0 && value <= 10 ? value : null
}

function quantityOf(text: string): number | null {
  const match = text.match(new RegExp(`\\b${COUNT}\\s*(?:cop(?:y|ies)|x|of them)\\b`, 'i'))
  return countWord(match?.[1])
}

function targetQuantity(text: string): number | null {
  const match =
    text.match(new RegExp(`\\b(?:to|at)\\s+${COUNT_N}\\b`, 'i')) ||
    text.match(new RegExp(`\\b(?:only|just|exactly)\\s+(?:(?:want|need|get)\\s+)?${COUNT}\\b`, 'i')) ||
    text.match(new RegExp(`\\bquantity\\s*(?:to|of|:|=)?\\s*${COUNT_N}\\b`, 'i'))
  return countWord(match?.[1])
}

// With no title, a cart edit means the only book in the cart.
function cartBook(text: string, books: Book[], context: string, items: CartLine[]): Book | 'ambiguous' | 'undated' | null {
  const book = resolveBook(text, books, context)
  if (book) return book
  const first = items[0]
  if (items.length === 1 && first) {
    return books.find((item) => item.slug === first.slug) ?? { slug: first.slug, title: first.title, released: null, cents: first.unit_cents }
  }
  return items.length > 1 ? 'ambiguous' : null
}

function bookItem(book: Book, origin: string, ref: number, asOf: string): CatalogItem {
  return {
    type: 'product',
    ref,
    id: book.slug,
    title: book.title,
    url: `${origin}/book/${book.slug}`,
    price: { amount: (book.cents / 100).toFixed(2), currency: 'USD' },
    price_note: PRICE_NOTE,
    availability: 'in_stock',
    options: { format: 'Hardcover' },
    schema: 'https://schema.org/Book',
    valid_until: new Date(Date.parse(asOf) + 24 * 60 * 60 * 1000).toISOString(),
  }
}

function catalogReply(books: Book[], origin: string): ShopMessage {
  const asOf = new Date().toISOString()
  const shown = [...books].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 20)
  const items = shown.map((book, index) => bookItem(book, origin, index + 1, asOf))
  const lines = shown.map((book, index) => `[${index + 1}] ${book.title} is ${formatPrice(book.cents)}`)
  const more = books.length > shown.length ? `\nShowing 20 of ${books.length}. The rest are at ${origin}/books.` : ''
  const reply = !shown.length
    ? 'No books are for sale right now.'
    : shown.length === 1
      ? `${lines[0]}. ${PRICE_NOTE}`
      : `${shown.length} books. ${PRICE_NOTE}\n${lines.join('\n')}${more}`
  return { status: 'done', reply, ...(items.length ? { items, as_of: asOf } : {}) }
}

export async function publicShop(text: string, origin: string): Promise<ShopMessage | null> {
  const books = await catalog()
  const intent = shopIntent(text, books.map((book) => book.title))
  if (intent === 'newest') {
    const newest = newestBook(books)
    if (!newest?.released) return { status: 'done', reply: NO_DATES }
    const priced = catalogReply([newest], origin)
    return { ...priced, reply: `The newest book is ${newest.title} [1], released ${newest.released}. ${PRICE_NOTE}` }
  }
  if (intent !== 'catalog') return null
  const named = matchBook(text, books)
  if (named === 'ambiguous') return catalogReply(books.filter((book) => mentions(text, book.title)), origin)
  if (named) return catalogReply([named], origin)
  return catalogReply(books, origin)
}

function describeCart(origin: string, items: CartLine[]): string {
  if (!items.length) return `Your cart is empty. The books are at ${origin}/books.`
  const lines = items.map(
    (item) => `${item.quantity} × ${item.title} (${formatPrice(item.unit_cents)}) ${origin}/book/${item.slug}`
  )
  return `Your cart:\n${lines.join('\n')}\nTotal ${formatPrice(cartTotal(items))}, free shipping, no tax.`
}

function describeStatus(record: ConfirmationRecord, origin: string): string {
  const status = effectiveStatus(record)
  const names = record.lines.map((item) => item.title).join(', ') || 'that checkout'
  const total = `Total ${formatPrice(cartTotal(record.lines))}, free shipping, no tax.`
  if (status === 'pending') {
    return `This is the same checkout, not a new one. ${names} is waiting for your approval. ${total} ${confirmUrl(origin, record.id)}`
  }
  if (status === 'working') {
    return `${names} is in Stripe Checkout and has not been paid yet. ${total} Nothing new was started.`
  }
  if (status === 'done') {
    return `${record.result?.message || `${names} is paid.`} ${total}`
  }
  if (status === 'expired') return `The checkout for ${names} expired before it was approved. Nothing was bought.`
  if (status === 'denied') return `The checkout for ${names} was declined. Nothing was charged.`
  return record.result?.message || `The payment for ${names} did not go through. Nothing was charged.`
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

  if (intent === 'status') {
    const slug = text.match(/\border-[a-z0-9-]+\b/i)?.[0]
    if (slug) {
      const order = await getOrder(slug)
      if (!order || order.customer !== account) {
        return { status: 'done', reply: `I can't find ${slug} on this account. Nothing new was started.` }
      }
      return {
        status: 'done',
        reply: `Order ${order.slug} is ${order.status}. Total ${formatPrice(order.total_cents)}, free shipping, no tax. ${origin}/orders/${order.slug}`,
      }
    }
    const namedId = text.match(/\bcfm_[a-f0-9]{24}\b/i)?.[0]
    const record = namedId ? await findConfirmation(namedId) : await latestConfirmation(account, capFrom)
    if (!record || record.account !== account || record.cap_from !== capFrom) {
      return { status: 'done', reply: 'There is no checkout on this account yet. Nothing was started.' }
    }
    return {
      status: 'done',
      reply: describeStatus(record, origin),
      confirmation: publicConfirmation(record, origin),
    }
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
      reply: `Order ${order.slug} is ${order.status}. Total ${formatPrice(order.total_cents)}, free shipping, no tax. ${origin}/orders/${order.slug}`,
    }
  }

  if (intent === 'checkout') {
    const items = await getCart(account)
    const requested = resolveBook(text, books, context)
    if (requested === 'ambiguous') return { status: 'done', reply: `I did not check out. ${whichBook(books)}` }
    if (requested === 'undated') return { status: 'done', reply: `I did not check out. ${NO_DATES}` }
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
      reply: `Checking out ${names}. Total ${formatPrice(cartTotal(items))}, free shipping, no tax. This needs your OK: ${confirmation.url}`,
      confirmation,
    }
  }

  const items = await getCart(account)
  const book = intent === 'add' ? resolveBook(text, books, context) : cartBook(text, books, context, items)
  if (book === 'undated') return { status: 'done', reply: NO_DATES }
  if (!book || book === 'ambiguous') {
    const choices = intent === 'add' || !items.length ? books : items.map((item) => ({ ...item, released: null }))
    return { status: 'done', reply: whichBook(choices) }
  }
  const line = items.find((item) => item.slug === book.slug)

  if (intent === 'add') {
    const wanted = quantityOf(text) ?? 1
    // Adds are idempotent so a retried request does not add a second copy.
    if (!MORE.test(text) && line) {
      if (line.quantity >= wanted) {
        return { status: 'done', reply: `${book.title} is already in your cart. Nothing changed.\n${describeCart(origin, items)}` }
      }
      return applied(origin, await setQuantity(account, book.slug, wanted))
    }
    const result = await addToCart(account, book.slug, wanted)
    if (!result.ok) return { status: 'failed', error: { code: result.error, message: result.message } }
    return { status: 'done', reply: describeCart(origin, result.items) }
  }

  if (!line) {
    return { status: 'done', reply: `${book.title} is not in your cart. Nothing changed.\n${describeCart(origin, items)}` }
  }

  if (intent === 'quantity') {
    const target = targetQuantity(text)
    if (target === null) return { status: 'done', reply: `How many copies of ${book.title}? Say a number from 0 to 10.` }
    return applied(origin, await setQuantity(account, book.slug, target))
  }

  const fewer = /\b(duplicates?|extras?)\b/i.test(text) ? line.quantity - 1 : quantityOf(text)
  const next = fewer === null ? 0 : Math.max(0, line.quantity - fewer)
  return applied(origin, await setQuantity(account, book.slug, next))
}

function applied(origin: string, result: Awaited<ReturnType<typeof setQuantity>>): ShopMessage {
  if (!result.ok) return { status: 'failed', error: { code: result.error, message: result.message } }
  return { status: 'done', reply: describeCart(origin, result.items) }
}
