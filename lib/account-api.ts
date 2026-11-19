import { addToCart, cartTotal, getCart, setQuantity, type CartLine, type CartResult } from '@/lib/cart'
import { getOrder } from '@/lib/checkout'
import { lookupBook } from '@/lib/cap-shop'
import {
  findConfirmation,
  holdPurchase,
  latestConfirmation,
  publicConfirmation,
  type PublicConfirmation,
} from '@/lib/cap-confirm'
import { bearerGrant, capUrl, siteOrigin, type Grant } from '@/lib/oauth'

// Account routes for the hosted concierge. It calls these with the caller's
// CAP token, so each one acts only for the account that token belongs to.
// They live outside /cap/v1: the CAP door itself only carries messages.

type Ctx = { params: Promise<{ path?: string[] }> }

const NOTE = 'Hardcover. Free shipping, no tax, so the total is what the customer pays.'

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...extra } })
}

function fail(code: string, message: string, status: number, extra: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, extra)
}

async function accountFor(req: Request, origin: string): Promise<Grant | Response> {
  const grant = await bearerGrant(req, origin)
  if (!grant) {
    return fail('login_required', 'The customer needs to sign in to Stripe Press through CAP.', 401, {
      'WWW-Authenticate': `Bearer realm="${capUrl(origin)}"`,
    })
  }
  if (req.headers.get('cap-from') !== grant.capFrom) {
    return fail('forbidden', 'This login was issued to a different agent.', 403)
  }
  return grant
}

function cartView(items: CartLine[], origin: string) {
  return {
    items: items.map((item) => ({
      book: item.slug,
      title: item.title,
      quantity: item.quantity,
      unit_price: (item.unit_cents / 100).toFixed(2),
      url: `${origin}/book/${item.slug}`,
    })),
    total: (cartTotal(items) / 100).toFixed(2),
    currency: 'USD',
    note: NOTE,
  }
}

function cartResult(result: CartResult, origin: string): Response {
  if (!result.ok) return fail(result.error, result.message, result.status)
  return json({ cart: cartView(result.items, origin) })
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function quantityFrom(value: unknown, fallback: number | null): number | null {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null
}

async function bookFrom(value: unknown): Promise<{ slug: string } | Response> {
  const query = typeof value === 'string' ? value.trim() : ''
  if (!query) return fail('invalid_request', 'book is required: a slug or a title.', 400)
  const found = await lookupBook(query)
  if ('book' in found) return found.book
  const names = found.choices.map((book) => book.title).join(', ')
  return found.choices.length
    ? fail('ambiguous_book', `More than one book matches "${query}": ${names}. Ask which one.`, 409)
    : fail('book_not_found', `No Stripe Press book matches "${query}".`, 404)
}

function confirmationView(view: PublicConfirmation) {
  return {
    confirmation: view,
    ...(view.url ? { next: `Send the customer this link to approve: ${view.url}. Nothing is bought until they do.` } : {}),
  }
}

export async function handleAccount(req: Request, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params
  const route = `${req.method} ${path.join('/')}`
  const origin = siteOrigin(req)
  const grant = await accountFor(req, origin)
  if (grant instanceof Response) return grant
  const account = grant.account
  const label = { 'CAP-Account': account }

  if (route === 'GET cart') {
    return json({ cart: cartView(await getCart(account), origin) }, 200, label)
  }

  if (route === 'GET checkout') {
    const id = new URL(req.url).searchParams.get('id') || ''
    const record = id ? await findConfirmation(id) : await latestConfirmation(account, grant.capFrom)
    if (!record || record.account !== account || record.cap_from !== grant.capFrom) {
      return fail('not_found', 'There is no checkout on this account yet.', 404)
    }
    return json(confirmationView(publicConfirmation(record, origin)), 200, label)
  }

  if (path[0] === 'orders' && path.length === 2 && req.method === 'GET') {
    const order = await getOrder(path[1] || '')
    if (!order || order.customer !== account) return fail('not_found', 'That order is not on this account.', 404)
    return json({
      order: {
        id: order.slug,
        status: order.status,
        total: (order.total_cents / 100).toFixed(2),
        currency: 'USD',
        items: order.items.map((item) => ({ book: item.slug, title: item.title, quantity: item.quantity })),
        url: `${origin}/orders/${order.slug}`,
      },
    }, 200, label)
  }

  if (req.method !== 'POST' || !['cart/add', 'cart/quantity', 'cart/remove', 'checkout'].includes(path.join('/'))) {
    return fail('not_found', 'No such account route.', 404)
  }
  if (!grant.scope.includes('write')) {
    return fail('write_required', 'This login can read the cart. The customer needs to sign in again and allow changes.', 403)
  }
  const body = await readBody(req)

  if (route === 'POST checkout') {
    const items = await getCart(account)
    if (!items.length) return fail('cart_empty', 'The cart is empty. Nothing was held.', 409)
    const held = await holdPurchase(account, grant.capFrom, items, origin)
    return json({ cart: cartView(items, origin), ...confirmationView(publicConfirmation(held, origin)) }, 200, label)
  }

  const book = await bookFrom(body.book)
  if (book instanceof Response) return book

  if (route === 'POST cart/add') {
    const quantity = quantityFrom(body.quantity, 1)
    if (!quantity) return fail('invalid_quantity', 'quantity must be a whole number from 1 to 10.', 400)
    return cartResult(await addToCart(account, book.slug, quantity), origin)
  }
  if (route === 'POST cart/quantity') {
    const quantity = quantityFrom(body.quantity, null)
    if (quantity === null) return fail('invalid_quantity', 'quantity must be a whole number from 0 to 10. 0 removes it.', 400)
    return cartResult(await setQuantity(account, book.slug, quantity), origin)
  }
  return cartResult(await setQuantity(account, book.slug, 0), origin)
}
