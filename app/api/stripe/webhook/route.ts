import { createHmac, timingSafeEqual } from 'node:crypto'
import { clearCart } from '@/lib/cart'
import { markOrder } from '@/lib/checkout'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function verifySignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const parts = header.split(',').map((part) => {
    const index = part.indexOf('=')
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const
  })
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!timestamp || !signatures.length) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return signatures.some(
    (signature) => signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
}

type StripeEvent = {
  type?: string
  data?: {
    object?: {
      client_reference_id?: string | null
      payment_status?: string
      metadata?: Record<string, string>
    }
  }
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return Response.json({ error: 'webhook_not_configured' }, { status: 503 })

  const payload = await req.text()
  if (!verifySignature(payload, req.headers.get('stripe-signature'), secret)) {
    return Response.json({ error: 'bad_signature' }, { status: 400 })
  }

  const event = JSON.parse(payload) as StripeEvent
  const session = event.data?.object
  const orderSlug = session?.client_reference_id || session?.metadata?.order
  if (!orderSlug) return Response.json({ received: true })

  switch (event.type) {
    case 'checkout.session.completed': {
      if (session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required') {
        const customer = await markOrder(orderSlug, 'paid')
        if (customer) await clearCart(customer)
      }
      break
    }
    case 'checkout.session.async_payment_succeeded': {
      const customer = await markOrder(orderSlug, 'paid')
      if (customer) await clearCart(customer)
      break
    }
    case 'checkout.session.async_payment_failed':
      await markOrder(orderSlug, 'failed')
      break
    case 'checkout.session.expired':
      await markOrder(orderSlug, 'expired')
      break
  }

  return Response.json({ received: true })
}
