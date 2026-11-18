import Link from 'next/link'
import { getBooks, getDateValue, getPages } from '@/lib/cosmic'
import { isUtilityPage } from '@/lib/format'
import FeaturedShelf from '@/components/FeaturedShelf'
import LibraryIndex from '@/components/LibraryIndex'

export default async function HomePage() {
  const [books, pages] = await Promise.all([getBooks(), getPages()])

  const featured = [...books]
    .sort((a, b) => getDateValue(b) - getDateValue(a))
    .slice(0, 10)

  const websites = pages
    .filter((page) => !isUtilityPage(page.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug))

  return (
    <div>
      <h1 className="sr-only">Stripe Press — Ideas for progress</h1>

      {/* Featured releases */}
      {featured.length > 0 ? (
        <FeaturedShelf books={featured} />
      ) : (
        <section className="py-32 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            [ The shelves are empty ]
          </p>
          <p className="mt-4 font-serif text-3xl italic">Add a book in Cosmic to begin.</p>
        </section>
      )}

      {/* Sections */}
      <section aria-labelledby="sections-heading" className="border-t border-ink/15 py-12">
        <div className="flex items-baseline justify-between">
          <h2
            id="sections-heading"
            className="font-mono text-xs uppercase tracking-[0.2em] text-muted"
          >
            [ Sections ]
          </h2>
          <span className="hidden font-mono text-xs text-muted sm:inline">
            Press B or M
          </span>
        </div>
        <ul className="mt-6 grid gap-0 border-t border-ink/15 sm:grid-cols-2">
          <li className="border-b border-ink/15 sm:border-r">
            <Link
              href="/books"
              className="group flex items-baseline justify-between py-6 pr-4 sm:pr-8"
            >
              <span className="font-mono text-2xl transition-transform duration-500 group-hover:translate-x-2 sm:text-3xl">
                [ B ]ooks
              </span>
              <span className="font-mono text-xs text-muted">
                {books.length} {books.length === 1 ? 'title' : 'titles'} [+]
              </span>
            </Link>
          </li>
          <li className="border-b border-ink/15">
            <Link
              href="/#websites"
              className="group flex items-baseline justify-between py-6 sm:pl-8"
            >
              <span className="font-mono text-2xl transition-transform duration-500 group-hover:translate-x-2 sm:text-3xl">
                [ M ]ultimedia
              </span>
              <span className="font-mono text-xs text-muted">
                {websites.length} {websites.length === 1 ? 'site' : 'sites'} [+]
              </span>
            </Link>
          </li>
        </ul>
      </section>

      {/* Library index */}
      <section id="library" aria-labelledby="library-heading" className="scroll-mt-24 py-12">
        <div className="mb-8 flex items-baseline justify-between">
          <h2
            id="library-heading"
            className="font-mono text-xs uppercase tracking-[0.2em] text-muted"
          >
            [ Library ]
          </h2>
          <span className="font-mono text-xs text-muted">A–Z</span>
        </div>
        {books.length > 0 ? (
          <LibraryIndex books={books} />
        ) : (
          <p className="font-serif italic text-muted">No books yet.</p>
        )}
      </section>

      {/* Websites */}
      <section
        id="websites"
        aria-labelledby="websites-heading"
        className="scroll-mt-24 pb-20 pt-8"
      >
        <div className="mb-8 flex items-baseline justify-between">
          <h2
            id="websites-heading"
            className="font-mono text-xs uppercase tracking-[0.2em] text-muted"
          >
            [ Websites ]
          </h2>
          <span className="font-mono text-xs text-muted">
            {websites.length} {websites.length === 1 ? 'path' : 'paths'}
          </span>
        </div>
        {websites.length > 0 ? (
          <ul className="border-b border-ink/15">
            {websites.map((page) => (
              <li key={page.id} className="border-t border-ink/15">
                <Link
                  href={`/${page.slug}`}
                  className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4"
                >
                  <span className="font-mono text-xl transition-transform duration-500 group-hover:translate-x-2 sm:text-2xl">
                    /{page.slug}
                  </span>
                  <span className="flex-1 font-serif italic text-muted sm:text-right">
                    {page.title}
                  </span>
                  <span className="font-mono text-xs text-muted transition-colors group-hover:text-ink">
                    View details [+]
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-serif italic text-muted">No pages yet.</p>
        )}
      </section>
    </div>
  )
}