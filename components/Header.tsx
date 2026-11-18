'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type CartState = { signedIn: boolean; count: number }

export default function Header() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const [cart, setCart] = useState<CartState>({ signedIn: false, count: 0 })

  useEffect(() => {
    let cancelled = false
    fetch('/api/cart', { cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<CartState>) : null))
      .then((data) => {
        if (!cancelled && data) setCart({ signedIn: Boolean(data.signedIn), count: Number(data.count) || 0 })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pathname])

  return (
    <header className="mx-auto w-full max-w-7xl px-5 pt-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-ink/15 pb-5">
        <div>
          <Link
            href="/"
            className="font-mono text-sm font-medium uppercase tracking-[0.35em] transition-opacity duration-500 hover:opacity-60"
          >
            Stripe Press
          </Link>
          <p className="mt-1 font-serif text-sm italic text-muted">Ideas for progress</p>
        </div>

        <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs">
          {!isHome && (
            <Link
              href="/"
              className="text-muted transition-colors duration-500 hover:text-ink"
            >
              [Esc] to home
            </Link>
          )}
          <Link href="/books" className="transition-colors duration-500 hover:text-accent">
            [ B ]ooks
          </Link>
          <Link href="/#websites" className="transition-colors duration-500 hover:text-accent">
            [ M ]ultimedia
          </Link>
          <Link
            href="/cart"
            className="transition-colors duration-500 hover:text-accent"
            aria-label={`Cart, ${cart.count} item${cart.count === 1 ? '' : 's'}`}
          >
            [ Cart {cart.count} ]
          </Link>
          <Link href="/login" className="transition-colors duration-500 hover:text-accent">
            {cart.signedIn ? '[ Account ]' : '[ Sign in ]'}
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
