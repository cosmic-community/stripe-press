'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'

export default function Header() {
  const pathname = usePathname()
  const isHome = pathname === '/'

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
          <span className="text-muted" aria-label="Cart is empty">
            [ Cart 0 ]
          </span>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}