import type { Metadata } from 'next'
import Link from 'next/link'
import { signInAction, signOutAction, signUpAction } from '@/app/store-actions'
import { currentCustomer } from '@/lib/customer-session'

export const metadata: Metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>
}

const inputClass =
  'mt-2 w-full border border-ink/25 bg-transparent px-3 py-2 font-mono text-sm outline-none transition-colors duration-300 focus:border-ink'
const labelClass = 'mt-5 block font-mono text-xs uppercase tracking-[0.15em] text-muted'
const buttonClass =
  'mt-8 inline-block border border-ink bg-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.15em] text-paper transition-opacity duration-500 hover:opacity-80'

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/'
  const error = typeof params.error === 'string' ? params.error : ''
  const user = await currentCustomer()

  if (user) {
    return (
      <section className="mx-auto max-w-xl pb-24 pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ Account ]</p>
        <h1 className="mt-4 font-serif text-5xl font-medium tracking-tight">Signed in as {user}</h1>
        <p className="mt-6 font-serif text-lg leading-relaxed text-ink/80">
          Your cart and orders belong to this account. Agents you approve can manage your cart for you, but
          only you can pay.
        </p>
        <div className="mt-8 flex flex-wrap gap-6 font-mono text-xs uppercase tracking-[0.15em]">
          <Link href="/cart" className="border-b border-ink/40 pb-1 hover:border-ink">
            View cart
          </Link>
          <Link href="/login/device" className="border-b border-ink/40 pb-1 hover:border-ink">
            Approve an agent
          </Link>
        </div>
        <form action={signOutAction}>
          <button type="submit" className={buttonClass}>
            Sign out
          </button>
        </form>
      </section>
    )
  }

  return (
    <section className="pb-24 pt-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ Account ]</p>
      <h1 className="mt-4 font-serif text-5xl font-medium tracking-tight sm:text-6xl">Sign in</h1>
      <p className="mt-4 font-mono text-xs text-muted">
        Demo store: sign in as <strong>demo</strong> / <strong>demo</strong>, or create an account. No email is sent.
      </p>
      {error && (
        <p role="alert" className="mt-6 border-l-2 border-accent pl-4 font-mono text-xs text-accent">
          {error}
        </p>
      )}

      <div className="mt-12 grid gap-16 md:grid-cols-2">
        <form action={signInAction} className="max-w-md">
          <h2 className="font-serif text-2xl">Returning reader</h2>
          <input type="hidden" name="next" value={next} />
          <label className={labelClass}>
            Username
            <input name="username" autoComplete="username" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Password
            <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </label>
          <button type="submit" className={buttonClass}>
            Sign in
          </button>
        </form>

        <form action={signUpAction} className="max-w-md">
          <h2 className="font-serif text-2xl">New reader</h2>
          <input type="hidden" name="next" value={next} />
          <label className={labelClass}>
            Name
            <input name="name" autoComplete="name" className={inputClass} />
          </label>
          <label className={labelClass}>
            Email (optional)
            <input name="email" type="email" autoComplete="email" className={inputClass} />
          </label>
          <label className={labelClass}>
            Username
            <input name="username" autoComplete="username" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Password
            <input name="password" type="password" autoComplete="new-password" minLength={6} required className={inputClass} />
          </label>
          <button type="submit" className={buttonClass}>
            Create account
          </button>
        </form>
      </div>
    </section>
  )
}
