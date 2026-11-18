import { cosmic } from '@/lib/cosmic'
import { addToCart, cartCount, cartTotal, getCart, setQuantity, type CartLine } from '@/lib/cart'
import { getOrder, startCheckout } from '@/lib/checkout'
import { bearerGrant, capUrl, issuer, SCOPES, siteOrigin } from '@/lib/oauth'
import { formatPrice, priceCents } from '@/lib/pricing'

// The site's CAP door. Questions (/messages and anything else) are forwarded
// to the hosted Cosmic concierge. Signed-in actions (cart, checkout, orders)
// are handled here and require an OAuth bearer token from /oauth.

const UPSTREAM = (
  process.env.CAP_UPSTREAM_URL || 'https://dapi.cosmicjs.com/cap/v1/ck_2e04b1b4bd442d6998d3586711375b01'
).replace(/\/$/, '')

const LOCAL = new Set(['actions', 'books', 'cart', 'checkout', 'orders'])

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, CAP-Version, CAP-From, CAP-Conversation',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Location',
}

type Ctx = { params: Promise<{ path?: string[] }> }

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...CORS, 'Cache-Control': 'no-store', ...extra } })
}

export async function handleCap(req: Request, ctx: Ctx): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const { path = [] } = await ctx.params
  const first = path[0]
  if (first !== undefined && LOCAL.has(first)) return handleLocal(req, path)
  return proxy(req, path)
}

async function proxy(req: Request, path: string[]): Promise<Response> {
  const origin = siteOrigin(req)
  const incoming = new URL(req.url)
  const target = `${UPSTREAM}${path.length ? '/' + path.map(encodeURIComponent).join('/') : ''}${incoming.search}`
  const headers = new Headers()
  req.headers.forEach((value, name) => {
    const key = name.toLowerCase()
    if (key.startsWith('cap-') || ['content-type', 'accept', 'accept-language'].includes(key)) {
      headers.set(name, value)
    }
  })
  const init: RequestInit = { method: req.method, headers, redirect: 'manual' }
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.text()

  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch {
    return json({ error: 'upstream_unavailable', message: 'The concierge is unreachable right now. Try again shortly.' }, 502)
  }

  const out = new Headers(CORS)
  const ourDoor = capUrl(origin)
  upstream.headers.forEach((value, name) => {
    const key = name.toLowerCase()
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) return
    if (key.startsWith('access-control-')) return
    out.set(name, key === 'location' ? value.split(UPSTREAM).join(ourDoor) : value)
  })
  if (upstream.status === 204 || upstream.status === 304) {
    return new Response(null, { status: upstream.status, headers: out })
  }
  const type = upstream.headers.get('content-type') || ''
  if (/json|text|html/.test(type)) {
    const text = await upstream.text()
    return new Response(text.split(UPSTREAM).join(ourDoor), { status: upstream.status, headers: out })
  }
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: out })
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await req.json()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function unauthorized(origin: string): Response {
  return json(
    {
      error: 'login_required',
      message:
        'This action acts for a signed-in Stripe Press customer. Get a token with the OAuth device flow, then retry with Authorization: Bearer {access_token}.',
      oauth: issuer(origin),
      metadata: `${origin}/.well-known/oauth-authorization-server/oauth`,
      actions: `${capUrl(origin)}/actions`,
    },
    401,
    {
      'WWW-Authenticate': `Bearer realm="${capUrl(origin)}", resource_metadata="${origin}/.well-known/oauth-protected-resource/cap/v1", scope="${SCOPES.join(' ')}"`,
    }
  )
}

function cartView(origin: string, items: CartLine[]) {
  const total = cartTotal(items)
  return {
    items: items.map((item) => ({
      ...item,
      unit_price: formatPrice(item.unit_cents),
      url: `${origin}/book/${item.slug}`,
    })),
    count: cartCount(items),
    total_cents: total,
    total: formatPrice(total),
    currency: 'usd',
    checkout: `${capUrl(origin)}/checkout`,
  }
}

async function listBooks(origin: string) {
  try {
    const response = await cosmic.objects.find({ type: 'book' }).props(['slug', 'title', 'metadata']).limit(100)
    const objects = (response.objects ?? []) as { slug: string; title: string; metadata?: { price?: unknown } }[]
    return objects.map((object) => {
      const cents = priceCents(object.metadata?.price)
      return {
        slug: object.slug,
        title: object.title,
        format: 'Hardcover',
        price_cents: cents,
        price: cents === null ? null : formatPrice(cents),
        available: cents !== null,
        url: `${origin}/book/${object.slug}`,
      }
    })
  } catch {
    return []
  }
}

function actionsDoc(origin: string) {
  const cap = capUrl(origin)
  const iss = issuer(origin)
  return {
    door: cap,
    ask: `POST ${cap}/messages with {"message": "..."} to ask the Stripe Press concierge anything. No login needed.`,
    oauth: {
      issuer: iss,
      metadata: `${origin}/.well-known/oauth-authorization-server/oauth`,
      grant: 'urn:ietf:params:oauth:grant-type:device_code',
      client_registration: 'none (public client, no secret)',
      scopes: {
        cart: 'See and change the customer cart, and read their orders.',
        checkout: 'Create a Stripe Checkout link. The customer still reviews and pays on Stripe themselves.',
      },
      steps: [
        `POST ${iss}/device (form or JSON, optional scope="cart checkout").`,
        'Show the customer verification_uri_complete (or verification_uri plus user_code). They sign in and approve.',
        `Poll POST ${iss}/token with grant_type=urn:ietf:params:oauth:grant-type:device_code and device_code, every interval seconds.`,
        'Call the actions below with Authorization: Bearer {access_token}. Refresh with grant_type=refresh_token; refresh tokens rotate on every use.',
      ],
    },
    actions: [
      { method: 'GET', url: `${cap}/books`, auth: false, description: 'Catalog with prices (USD, hardcover, before shipping and tax).' },
      { method: 'GET', url: `${cap}/cart`, scope: 'cart', description: 'The customer cart.' },
      { method: 'POST', url: `${cap}/cart/items`, scope: 'cart', body: { book: 'book-slug', quantity: 1 }, description: 'Add a book.' },
      { method: 'PATCH', url: `${cap}/cart/items/{book-slug}`, scope: 'cart', body: { quantity: 2 }, description: 'Change a quantity (0 removes it).' },
      { method: 'DELETE', url: `${cap}/cart/items/{book-slug}`, scope: 'cart', description: 'Remove a book.' },
      {
        method: 'POST',
        url: `${cap}/checkout`,
        scope: 'checkout',
        description: 'Returns 202 with a Stripe Checkout link for the customer. The order is only complete once the customer pays.',
      },
      { method: 'GET', url: `${cap}/orders/{order}`, scope: 'cart', description: 'Order status: pending, paid, expired or failed.' },
    ],
  }
}

async function handleLocal(req: Request, path: string[]): Promise<Response> {
  const origin = siteOrigin(req)
  const [head, ...rest] = path

  if (head === 'actions' && req.method === 'GET') return json(actionsDoc(origin))
  if (head === 'books' && req.method === 'GET') return json({ books: await listBooks(origin) })

  const grant = bearerGrant(req, origin)
  if (!grant) return unauthorized(origin)
  const needed = head === 'checkout' ? 'checkout' : 'cart'
  if (!grant.scope.includes(needed)) {
    return json(
      { error: 'insufficient_scope', scope: needed, message: `This token is missing the "${needed}" scope. Start a new login that requests it.` },
      403,
      { 'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${needed}"` }
    )
  }
  const account = grant.account

  if (head === 'cart') {
    if (rest.length === 0 && req.method === 'GET') {
      return json(cartView(origin, await getCart(account)))
    }
    if (rest[0] === 'items' && rest.length === 1 && req.method === 'POST') {
      const body = await readJson(req)
      const book = String(body.book ?? body.slug ?? '')
      const result = await addToCart(account, book, Number(body.quantity ?? 1))
      return result.ok
        ? json(cartView(origin, result.items), 201)
        : json({ error: result.error, message: result.message }, result.status)
    }
    if (rest[0] === 'items' && rest.length === 2 && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const quantity = req.method === 'DELETE' ? 0 : Number((await readJson(req)).quantity)
      const result = await setQuantity(account, rest[1] ?? '', quantity)
      return result.ok
        ? json(cartView(origin, result.items))
        : json({ error: result.error, message: result.message }, result.status)
    }
  }

  if (head === 'checkout' && rest.length === 0 && req.method === 'POST') {
    const result = await startCheckout(account, origin, 'agent')
    if (!result.ok) return json({ error: result.error, message: result.message }, result.status)
    return json(
      {
        status: 'awaiting_customer',
        order: result.order,
        total_cents: result.total_cents,
        total: formatPrice(result.total_cents),
        checkout_url: result.url,
        order_url: `${capUrl(origin)}/orders/${result.order}`,
        message:
          'Give the customer this checkout link. They enter shipping and payment on Stripe themselves; the order is complete only after they pay. Poll order_url for status.',
      },
      202
    )
  }

  if (head === 'orders' && rest.length === 1 && req.method === 'GET') {
    const order = await getOrder(rest[0] ?? '')
    if (!order || order.customer !== account) return json({ error: 'not_found' }, 404)
    return json({ ...order, total: formatPrice(order.total_cents) })
  }

  return json({ error: 'not_found', message: `Unknown action. See ${capUrl(origin)}/actions.` }, 404)
}
