'use client'

import Link from 'next/link'
import { Fragment, useState } from 'react'
import type { Book } from '@/types'
import BookCover from '@/components/BookCover'
import { deriveByline, titleSortKey } from '@/lib/format'

interface LibraryIndexProps {
  books: Book[]
}

interface Entry {
  book: Book
  number: string
  letter: string
}

export default function LibraryIndex({ books }: LibraryIndexProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const entries: Entry[] = books.map((book, i) => {
    const first = titleSortKey(book.title).charAt(0).toUpperCase()
    return {
      book,
      number: String(i + 1).padStart(2, '0'),
      letter: /[A-Z]/.test(first) ? first : '#',
    }
  })

  const active = books.find((book) => book.id === activeId) ?? null

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ol className="border-b border-ink/15" onMouseLeave={() => setActiveId(null)}>
        {entries.map((entry, i) => {
          const previous = entries[i - 1]
          const showLetter = !previous || previous.letter !== entry.letter
          const byline = deriveByline(entry.book.metadata?.seo_description)

          return (
            <Fragment key={entry.book.id}>
              {showLetter && (
                <li
                  aria-hidden="true"
                  className="border-t border-ink/15 pb-1 pt-6 font-mono text-xs text-accent"
                >
                  {entry.letter}
                </li>
              )}
              <li>
                <Link
                  href={`/book/${entry.book.slug}`}
                  onMouseEnter={() => setActiveId(entry.book.id)}
                  onFocus={() => setActiveId(entry.book.id)}
                  onBlur={() => setActiveId(null)}
                  className="group flex items-baseline gap-4 py-2 sm:gap-6"
                >
                  <span className="w-8 shrink-0 font-mono text-xs text-muted">{entry.number}</span>
                  <span
                    className={`flex-1 font-serif text-2xl leading-snug transition-all duration-500 group-hover:translate-x-2 sm:text-4xl ${
                      activeId && activeId !== entry.book.id ? 'opacity-40' : 'opacity-100'
                    }`}
                  >
                    {entry.book.title}
                  </span>
                  {byline && (
                    <span className="hidden max-w-[16rem] truncate font-mono text-[11px] uppercase tracking-wider text-muted md:block">
                      {byline}
                    </span>
                  )}
                </Link>
              </li>
            </Fragment>
          )
        })}
      </ol>

      {/* Hover preview */}
      <aside className="hidden lg:block" aria-hidden="true">
        <div className="sticky top-24">
          {active ? (
            <div key={active.id} className="mx-auto w-56 animate-fade-in">
              <BookCover book={active} width={600} />
              <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
                View details [+]
              </p>
            </div>
          ) : (
            <div className="mx-auto flex aspect-[2/3] w-56 items-center justify-center border border-dashed border-ink/25 p-6 text-center font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-muted">
              [ Hover a title to preview its cover ]
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}