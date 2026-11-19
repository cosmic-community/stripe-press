import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { approveConfirmation, denyConfirmation } from '@/app/confirm/actions'
import { effectiveStatus, findConfirmation, publicConfirmation } from '@/lib/cap-confirm'
import { currentCustomer } from '@/lib/customer-session'
import { formatPrice } from '@/lib/pricing'
import { cartTotal } from '@/lib/cart'
import SubmitButton from '@/components/SubmitButton'

export const metadata: Metadata = { title: 'Confirm your order' }
export const dynamic = 'force-dynamic'

const buttonClass =
  'border border-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.15em] transition-opacity duration-500 hover:opacity-80'

interface ConfirmPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; done?: string; canceled?: string }>
}

export default async function ConfirmPage({ params, searchParams }: ConfirmPageProps) {
  const { id } = await params
  const query = await searchParams
  const user = await currentCustomer()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/confirm/${id}`)}`)

  const record = await findConfirmation(id)
  if (!record || record.account !== user) {
    return (
      <section className="mx-auto max-w-2xl pb-24 pt-16">
        <h1 className="font-serif text-5xl font-medium tracking-tight">This approval is not yours</h1>
        <p className="mt-4 font-serif text-xl">Sign in as the customer the agent asked, or ask the agent to start again.</p>
      </section>
    )
  }

  const view = publicConfirmation(record, '')
  const status = effectiveStatus(record)
  const total = cartTotal(record.lines)
  const purchase = record.authorization_details[0]

  return (
    <section className="mx-auto max-w-2xl pb-24 pt-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ Confirm an order ]</p>
      <h1 className="mt-4 font-serif text-5xl font-medium tracking-tight">Pay for this order?</h1>
      <p className="mt-4 font-mono text-xs text-muted">Signed in as {user}</p>
      <p className="mt-6 font-serif text-xl">{record.summary}</p>

      <ul className="mt-8 divide-y divide-ink/15 border-y border-ink/15">
        {record.lines.map((item) => (
          <li key={item.slug} className="flex items-baseline justify-between gap-6 py-4">
            <span className="font-serif text-lg">
              {item.quantity} × {item.title}
            </span>
            <span className="font-mono text-xs">{formatPrice(item.quantity * item.unit_cents)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-mono text-xs text-muted">
        Total {formatPrice(total)}
        {purchase ? ` (${purchase.currency})` : ''}. Free shipping, no tax. The order is placed only after you pay.
      </p>

      {query.canceled && status === 'working' && (
        <p role="status" className="mt-8 border-l-2 border-ink pl-4 font-serif text-xl">
          Checkout was canceled. Nothing was charged.
        </p>
      )}
      {query.error === 'closed' && (
        <p role="alert" className="mt-8 border-l-2 border-accent pl-4 font-serif text-xl">
          This approval is no longer waiting. Ask the agent to start again.
        </p>
      )}

      {status === 'pending' && (
        <div className="mt-8 flex flex-wrap gap-4">
          <form action={approveConfirmation}>
            <input type="hidden" name="id" value={record.id} />
            <SubmitButton pendingLabel="Opening Stripe…" className={`${buttonClass} bg-ink text-paper`}>
              Continue to payment
            </SubmitButton>
          </form>
          <form action={denyConfirmation}>
            <input type="hidden" name="id" value={record.id} />
            <SubmitButton pendingLabel="Declining…" className={buttonClass}>
              Decline
            </SubmitButton>
          </form>
        </div>
      )}

      {status === 'working' && record.stripe_url && (
        <p className="mt-8 font-mono text-xs uppercase tracking-[0.15em]">
          <a href={record.stripe_url} className="border-b border-ink/40 pb-1 hover:border-ink">
            Return to Stripe Checkout
          </a>
        </p>
      )}

      {status === 'done' && (
        <p role="status" className="mt-8 border-l-2 border-ink pl-4 font-serif text-xl">
          {view.result?.message || 'Paid.'}{' '}
          {view.result?.reference && (
            <Link href={`/orders/${view.result.reference}`} className="border-b border-ink/40">
              View the order
            </Link>
          )}
        </p>
      )}

      {(status === 'denied' || status === 'expired' || status === 'failed') && (
        <p role="status" className="mt-8 border-l-2 border-ink pl-4 font-serif text-xl">
          {status === 'denied' && 'Declined. Nothing was charged.'}
          {status === 'expired' && 'This approval expired. Ask the agent to start again.'}
          {status === 'failed' && (view.result?.message || 'The payment did not go through. Nothing was charged.')}
        </p>
      )}
    </section>
  )
}
