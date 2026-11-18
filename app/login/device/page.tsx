import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { deviceDecisionAction } from '@/app/store-actions'
import { currentCustomer } from '@/lib/customer-session'
import { findDeviceRequest } from '@/lib/oauth'

export const metadata: Metadata = { title: 'Approve an agent' }
export const dynamic = 'force-dynamic'

const SCOPE_TEXT: Record<string, string> = {
  cart: 'See and change your cart, and check your orders',
  checkout: 'Start a checkout. You still review and pay on Stripe yourself.',
}

const DONE_TEXT: Record<string, string> = {
  approved: 'Approved. The agent can now act on your cart. You can close this page.',
  denied: 'Declined. The agent was not given access.',
  invalid: 'That code is invalid, expired, or already used. Ask the agent to start again.',
}

const buttonClass =
  'border border-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.15em] transition-opacity duration-500 hover:opacity-80'

interface DevicePageProps {
  searchParams: Promise<{ code?: string; done?: string }>
}

function CodeForm({ code }: { code?: string }) {
  return (
    <form action="/login/device" method="get" className="mt-8 flex flex-wrap items-end gap-4">
      <label className="block font-mono text-xs uppercase tracking-[0.15em] text-muted">
        Code from your agent
        <input
          name="code"
          defaultValue={code}
          placeholder="ABCD-EFGH"
          autoComplete="off"
          required
          className="mt-2 block w-56 border border-ink/25 bg-transparent px-3 py-2 font-mono text-lg uppercase tracking-[0.2em] outline-none focus:border-ink"
        />
      </label>
      <button type="submit" className={`${buttonClass} bg-ink text-paper`}>
        Continue
      </button>
    </form>
  )
}

export default async function DevicePage({ searchParams }: DevicePageProps) {
  const params = await searchParams
  const code = typeof params.code === 'string' ? params.code : ''
  const done = typeof params.done === 'string' ? params.done : ''
  const user = await currentCustomer()
  if (!user) {
    const back = code ? `/login/device?code=${encodeURIComponent(code)}` : '/login/device'
    redirect(`/login?next=${encodeURIComponent(back)}`)
  }

  const request = code ? await findDeviceRequest(code) : null
  const pending = request && request.record.status === 'pending' ? request.record : null

  return (
    <section className="mx-auto max-w-2xl pb-24 pt-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ Approve an agent ]</p>
      <h1 className="mt-4 font-serif text-5xl font-medium tracking-tight">Let an agent shop for you?</h1>
      <p className="mt-4 font-mono text-xs text-muted">Signed in as {user}</p>

      {done && DONE_TEXT[done] && (
        <p role="status" className="mt-8 border-l-2 border-ink pl-4 font-serif text-xl">
          {DONE_TEXT[done]}
        </p>
      )}

      {pending ? (
        <div className="mt-10 border-y border-ink/15 py-8">
          <p className="font-serif text-xl">
            <strong>{pending.client}</strong> wants to act for you at Stripe Press.
          </p>
          <p className="mt-4 font-mono text-sm tracking-[0.2em]">Code: {pending.user_code}</p>
          <p className="mt-2 font-mono text-xs text-muted">Only approve if this matches the code your agent showed you.</p>
          <ul className="mt-6 list-disc pl-5 font-serif text-lg">
            {pending.scope.split(' ').map((scope) => (
              <li key={scope}>{SCOPE_TEXT[scope] ?? scope}</li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-4">
            <form action={deviceDecisionAction}>
              <input type="hidden" name="code" value={pending.user_code} />
              <input type="hidden" name="decision" value="approve" />
              <button type="submit" className={`${buttonClass} bg-ink text-paper`}>
                Approve
              </button>
            </form>
            <form action={deviceDecisionAction}>
              <input type="hidden" name="code" value={pending.user_code} />
              <input type="hidden" name="decision" value="deny" />
              <button type="submit" className={buttonClass}>
                Deny
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {code && !done && (
            <p role="alert" className="mt-8 border-l-2 border-accent pl-4 font-mono text-xs text-accent">
              {DONE_TEXT.invalid}
            </p>
          )}
          {!done && <CodeForm code={code} />}
          {done && (
            <p className="mt-8 font-mono text-xs uppercase tracking-[0.15em]">
              <Link href="/cart" className="border-b border-ink/40 pb-1 hover:border-ink">
                Go to your cart
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  )
}
