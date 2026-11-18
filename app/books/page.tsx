import type { Metadata } from 'next'
import Link from 'next/link'
import { getBooks } from '@/lib/cosmic'
import { deriveByline } from '@/lib/format'
import BookCover from '@/components/BookCover'

export const metadata: Metadata = {
  title: 'Books',
  description: 'Every book from Stripe Press, on one shelf.',
}

export default async function BooksPage() {
  const books = await getBooks()

  return (
    <div className="pb-24 pt-10">
      <header className="mb-12 flex flex-wrap items-baseline justify-between gap-4 border-b border-ink/15 pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ B ]ooks</p>
          <h1 className="mt-3 font-serif text-5xl font-medium tracking-tight sm:text-7xl">
            The shelf
          </h1>
        </div>
        <p className="font-mono text-xs text-muted">
          {books.length} {books.length === 1 ? 'title' : 'titles'}
        </p>
      </header>

      {books.length === 0 ? (
        <p className="py-24 text-center font-serif text-2xl italic text-muted">
          No books have been shelved yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-0 gap-y-14 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {books.map((book) => {
            const byline = deriveByline(book.metadata?.seo_description)
            return (
              <li key={book.id}>
                <Link href={`/book/${book.slug}`} className="group block">
                  <div className="px-4 sm:px-6">
                    <BookCover book={book} width={600} />
                  </div>
                  <div className="shelf-plank" aria-hidden="true" />
                  <div className="px-4 pt-3 sm:px-6">
                    <h2 className="font-serif text-xl leading-tight transition-transform duration-500 group-hover:translate-x-1">
                      {book.title}
                    </h2>
                    {byline && (
                      <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                        {byline}
                      </p>
                    )}
                    <p className="mt-2 font-mono text-[11px] text-muted opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                      Open book [+]
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}