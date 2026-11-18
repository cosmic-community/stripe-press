'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { Book } from '@/types'
import BookCover from '@/components/BookCover'
import { deriveByline } from '@/lib/format'

interface FeaturedShelfProps {
  books: Book[]
}

export default function FeaturedShelf({ books }: FeaturedShelfProps) {
  const [index, setIndex] = useState(0)
  const count = books.length

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => (count === 0 ? 0 : (current + delta + count) % count))
    },
    [count]
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'ArrowRight') {
        go(1)
      } else if (event.key === 'ArrowLeft') {
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const current = books[index]
  if (!current) {
    return null
  }

  const prev = count > 2 ? books[(index - 1 + count) % count] : undefined
  const next = count > 1 ? books[(index + 1) % count] : undefined
  const byline = deriveByline(current.metadata?.seo_description)

  return (
    <section
      aria-roledescription="carousel"
      aria-label="New and featured releases"
      className="py-10 sm:py-14"
    >
      <div className="flex items-baseline justify-between font-mono text-xs">
        <h2 className="uppercase tracking-[0.2em] text-muted">[ NEW &amp; FEATURED RELEASES ]</h2>
        <p aria-live="polite" className="text-muted">
          {index + 1} of {count}
        </p>
      </div>

      {/* Stage */}
      <div className="mt-10 grid grid-cols-1 items-end md:grid-cols-[1fr_auto_1fr] md:gap-10">
        <div className="hidden justify-end md:flex">
          {prev && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={`Show previous book: ${prev.title}`}
              className="w-36 origin-bottom-right scale-95 opacity-40 grayscale transition-all duration-700 hover:opacity-80 hover:grayscale-0 lg:w-48"
            >
              <BookCover book={prev} width={400} tilt={false} />
            </button>
          )}
        </div>

        <div key={current.id} className="mx-auto w-64 animate-fade-up sm:w-72 md:w-80 lg:w-96">
          <Link
            href={`/book/${current.slug}`}
            aria-label={`Open ${current.title}`}
            className="group block"
          >
            <BookCover book={current} width={900} eager />
          </Link>
        </div>

        <div className="hidden justify-start md:flex">
          {next && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={`Show next book: ${next.title}`}
              className="w-36 origin-bottom-left scale-95 opacity-40 grayscale transition-all duration-700 hover:opacity-80 hover:grayscale-0 lg:w-48"
            >
              <BookCover book={next} width={400} tilt={false} />
            </button>
          )}
        </div>
      </div>

      <div className="shelf-plank mx-auto mt-0 max-w-4xl" aria-hidden="true" />

      {/* Caption */}
      <div key={`caption-${current.id}`} className="mx-auto mt-10 max-w-2xl animate-fade-up text-center">
        <h3 className="font-serif text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          {current.title}
        </h3>
        {byline && (
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted">
            {byline}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 font-mono text-xs">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous book"
            className="text-muted transition-colors duration-500 hover:text-ink"
          >
            [ ← ]
          </button>
          <Link
            href={`/book/${current.slug}`}
            className="border-b border-ink/40 pb-1 uppercase tracking-[0.15em] transition-colors duration-500 hover:border-ink hover:text-accent"
          >
            Open book [+]
          </Link>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next book"
            className="text-muted transition-colors duration-500 hover:text-ink"
          >
            [ → ]
          </button>
        </div>
      </div>
    </section>
  )
}