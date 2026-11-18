import { randomBytes } from 'node:crypto'
import { getMetafieldValue } from '@/lib/cosmic'
import { findObject, insertObject, updateMetadata } from '@/lib/cosmic-store'
import { cartTotal, getCart, parseItems, type CartLine } from '@/lib/cart'

export type CheckoutResult =
  | { ok: true; url: string; order: string; total_cents: number }
  | { ok: false; status: number; error: string; message: string }

export type OrderView = {
  slug: string
  status: string
  source: string
  total_cents: number
  items: CartLine[]
  customer: string
  created_at?: string
}

const SHIPPING_COUNTRIES = ['US', 'CA', 'GB', 'AU', 'IE', 'NZ']

export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

// Creates a pending Order and a Stripe Checkout Session. The customer must
// open the returned URL and pay; the webhook marks the order paid.
export async function startCheckout(
  username: string,
  origin: string,
  source: 'web' | 'agent',
  options?: { items?: CartLine[]; confirmationId?: string; cancelUrl?: string }
): Promise<CheckoutResult> {
  const items = options?.items ?? (await getCart(username))
  if (!items.length) {
    return { ok: false, status: 409, error: 'cart_empty', message: 'The cart is empty.' }
  }
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return {
      ok: false,
      status: 503,
      error: 'payments_not_configured',
      message: 'Checkout is not available yet: payments have not been configured.',
    }
  }

  const total = cartTotal(items)
  const slug = `order-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  const metadata: Record<string, unknown> = {
    customer: username,
    items,
    total_cents: total,
    order_status: 'pending',
    source,
    stripe_session_id: '',
  }
  const order = await insertObject('orders', slug, `Order ${slug.slice(6)} (${username})`, metadata)

  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', `${origin}/orders/${slug}?checkout=success`)
  params.set('cancel_url', options?.cancelUrl || `${origin}/cart`)
  params.set('client_reference_id', slug)
  params.set('metadata[order]', slug)
  params.set('metadata[customer]', username)
  params.set('metadata[source]', source)
  if (options?.confirmationId) params.set('metadata[confirmation]', options.confirmationId)
  SHIPPING_COUNTRIES.forEach((country, index) => {
    params.set(`shipping_address_collection[allowed_countries][${index}]`, country)
  })
  items.forEach((item, index) => {
    params.set(`line_items[${index}][quantity]`, String(item.quantity))
    params.set(`line_items[${index}][price_data][currency]`, 'usd')
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unit_cents))
    params.set(`line_items[${index}][price_data][product_data][name]`, `${item.title} (Hardcover)`)
  })

  let data: { id?: string; url?: string; error?: { message?: string } } = {}
  let ok = false
  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    ok = response.ok
    data = (await response.json().catch(() => ({}))) as typeof data
  } catch {
    ok = false
  }

  if (!ok || !data.url || !data.id) {
    await updateMetadata(order.id, { ...metadata, order_status: 'failed' })
    return {
      ok: false,
      status: 502,
      error: 'stripe_error',
      message: data.error?.message || 'Stripe could not create a checkout session.',
    }
  }

  await updateMetadata(order.id, { ...metadata, stripe_session_id: data.id })
  return { ok: true, url: data.url, order: slug, total_cents: total }
}

export async function getOrder(slug: string): Promise<OrderView | null> {
  if (!/^order-[a-z0-9-]+$/.test(slug)) return null
  const object = await findObject('orders', slug)
  if (!object) return null
  const m = object.metadata
  return {
    slug: object.slug,
    status: getMetafieldValue(m.order_status) || 'pending',
    source: getMetafieldValue(m.source),
    total_cents: Number(m.total_cents) || 0,
    items: parseItems(m.items),
    customer: getMetafieldValue(m.customer),
    created_at: object.created_at,
  }
}

// Returns the order's customer so the caller can clear their cart.
export async function markOrder(slug: string, status: 'paid' | 'expired' | 'failed'): Promise<string | null> {
  const object = await findObject('orders', slug)
  if (!object) return null
  await updateMetadata(object.id, { ...object.metadata, order_status: status })
  return getMetafieldValue(object.metadata.customer) || null
}
