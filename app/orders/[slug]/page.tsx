import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getOrder } from '@/lib/checkout'
import { currentCustomer } from '@/lib/customer-session'
import { formatPrice } from '@/lib/pricing'

export const metadata: Metadata = { title: 'Order' }
export const dynamic = 'force-dynamic'

interface OrderPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ checkout?: string }>
}

const STATUS_TEXT: Record<string, string> = {
  pending: 'Waiting for payment confirmation.',
  paid: 'Paid. Thank you. Your books are on their way.',
  expired: 'This checkout expired before payment.',
  failed: 'Payment did not go through.',
}

export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const user = await currentCustomer()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/orders/${slug}`)}`)
  const order = await getOrder(slug)
  if (!order || order.customer !== user) notFound()

  const justPaid = query.checkout === 'success' && order.status === 'pending'

  return (
    <section className="mx-auto max-w-3xl pb-24 pt-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ Order {order.slug.slice(6)} ]</p>
      <h1 className="mt-4 font-serif text-5xl font-medium tracking-tight">
        {order.status === 'paid' ? 'Thank you' : 'Your order'}
      </h1>
      <p className="mt-6 font-serif text-xl">
        {justPaid ? 'Payment received. We are confirming it now; refresh in a moment.' : STATUS_TEXT[order.status] ?? order.status}
      </p>
      {order.source === 'agent' && (
        <p className="mt-2 font-mono text-xs text-muted">Started by an agent you approved.</p>
      )}
      <ul className="mt-10 border-t border-ink/15">
        {order.items.map((item) => (
          <li key={item.slug} className="flex justify-between gap-6 border-b border-ink/15 py-4">
            <span className="font-serif text-lg">
              {item.title} <span className="font-mono text-xs text-muted">× {item.quantity}</span>
            </span>
            <span className="font-mono text-sm">{formatPrice(item.unit_cents * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-right font-serif text-2xl">Subtotal {formatPrice(order.total_cents)}</p>
      <p className="mt-10 font-mono text-xs uppercase tracking-[0.15em]">
        <Link href="/books" className="border-b border-ink/40 pb-1 hover:border-ink">
          Keep browsing
        </Link>
      </p>
    </section>
  )
}
