import type { Metadata } from 'next'
import Link from 'next/link'
import { checkoutAction, updateQuantityAction } from '@/app/store-actions'
import { cartTotal, getCart } from '@/lib/cart'
import { paymentsConfigured } from '@/lib/checkout'
import { currentCustomer } from '@/lib/customer-session'
import { formatPrice } from '@/lib/pricing'
import SubmitButton from '@/components/SubmitButton'

export const metadata: Metadata = { title: 'Cart' }
export const dynamic = 'force-dynamic'

interface CartPageProps {
  searchParams: Promise<{ error?: string }>
}

const smallButton =
  'font-mono text-xs uppercase tracking-[0.15em] text-muted transition-colors duration-500 hover:text-ink'

export default async function CartPage({ searchParams }: CartPageProps) {
  const params = await searchParams
  const error = typeof params.error === 'string' ? params.error : ''
  const user = await currentCustomer()

  if (!user) {
    return (
      <section className="mx-auto max-w-2xl pb-24 pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ Cart ]</p>
        <h1 className="mt-4 font-serif text-5xl font-medium tracking-tight">Your cart</h1>
        <p className="mt-6 font-serif text-lg">
          <Link href="/login?next=/cart" className="border-b border-ink/40 hover:border-ink">
            Sign in
          </Link>{' '}
          to see your cart.
        </p>
      </section>
    )
  }

  const items = await getCart(user)
  const total = cartTotal(items)
  const canPay = paymentsConfigured()

  return (
    <section className="mx-auto max-w-3xl pb-24 pt-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ Cart ]</p>
      <h1 className="mt-4 font-serif text-5xl font-medium tracking-tight">Your cart</h1>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-accent pl-4 font-mono text-xs text-accent">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="mt-10 font-serif text-lg">
          Your cart is empty.{' '}
          <Link href="/books" className="border-b border-ink/40 hover:border-ink">
            Browse the books
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="mt-10 border-t border-ink/15">
            {items.map((item) => (
              <li key={item.slug} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ink/15 py-6">
                <div className="min-w-0 flex-1">
                  <Link href={`/book/${item.slug}`} className="font-serif text-2xl hover:text-accent">
                    {item.title}
                  </Link>
                  <p className="mt-1 font-mono text-xs text-muted">Hardcover · {formatPrice(item.unit_cents)} each</p>
                </div>
                <form action={updateQuantityAction} className="flex items-center gap-3">
                  <input type="hidden" name="book" value={item.slug} />
                  <label className="sr-only" htmlFor={`qty-${item.slug}`}>
                    Quantity
                  </label>
                  <input
                    id={`qty-${item.slug}`}
                    name="quantity"
                    type="number"
                    min={0}
                    max={10}
                    defaultValue={item.quantity}
                    className="w-16 border border-ink/25 bg-transparent px-2 py-1 font-mono text-sm"
                  />
                  <SubmitButton pendingLabel="Updating…" className={smallButton}>
                    Update
                  </SubmitButton>
                </form>
                <form action={updateQuantityAction}>
                  <input type="hidden" name="book" value={item.slug} />
                  <input type="hidden" name="quantity" value="0" />
                  <SubmitButton pendingLabel="Removing…" className={smallButton}>
                    Remove
                  </SubmitButton>
                </form>
                <span className="w-24 text-right font-mono text-sm">{formatPrice(item.unit_cents * item.quantity)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-6">
            <p className="font-serif text-2xl">
              Subtotal {formatPrice(total)}
              <span className="ml-3 font-mono text-xs text-muted">Shipping and tax at checkout</span>
            </p>
            <form action={checkoutAction}>
              <SubmitButton
                disabled={!canPay}
                pendingLabel="Redirecting to Stripe…"
                className="border border-ink bg-ink px-6 py-3 font-mono text-xs uppercase tracking-[0.15em] text-paper transition-opacity duration-500 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Checkout [→]
              </SubmitButton>
            </form>
          </div>
          {!canPay && (
            <p className="mt-4 text-right font-mono text-xs text-muted">Checkout opens once payments are configured.</p>
          )}
        </>
      )}
    </section>
  )
}
