// app/book/[slug]/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBookBySlug, getBooks, getMetafieldValue } from '@/lib/cosmic'
import { deriveByline, imgixUrl, stripHtml, truncate } from '@/lib/format'
import BookCover from '@/components/BookCover'
import Prose from '@/components/Prose'

interface BookPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params
  const book = await getBookBySlug(slug)
  if (!book) {
    return { title: 'Book not found' }
  }
  const description = truncate(stripHtml(getMetafieldValue(book.metadata?.seo_description)), 200)
  const image = imgixUrl(book.metadata?.featured_image?.imgix_url, 'w=1200&h=630&fit=crop&auto=format,compress')
  return {
    title: book.title,
    description: description || undefined,
    openGraph: {
      title: book.title,
      description: description || undefined,
      images: image ? [image] : undefined,
    },
  }
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params
  const [book, books] = await Promise.all([getBookBySlug(slug), getBooks()])

  if (!book) {
    notFound()
  }

  const description = getMetafieldValue(book.metadata?.seo_description)
  const sourceUrl = getMetafieldValue(book.metadata?.source_url)
  const content = getMetafieldValue(book.metadata?.content) || book.content || ''
  const byline = deriveByline(description)

  const index = books.findIndex((candidate) => candidate.id === book.id)
  const hasNeighbours = books.length > 1 && index >= 0
  const prev = hasNeighbours ? books[(index - 1 + books.length) % books.length] : undefined
  const next = hasNeighbours ? books[(index + 1) % books.length] : undefined

  return (
    <article className="pb-24 pt-10">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        {/* Cover */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="mx-auto w-64 animate-fade-up sm:w-80 lg:w-full lg:max-w-md">
            <BookCover book={book} width={1000} eager />
          </div>
        </div>

        {/* Text */}
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ Book ]</p>
          <h1 className="mt-4 animate-fade-up font-serif text-5xl font-medium leading-[1.02] tracking-tight sm:text-7xl">
            {book.title}
          </h1>
          {byline && (
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted">
              {byline}
            </p>
          )}
          {description && (
            <p className="mt-8 max-w-xl font-serif text-xl italic leading-relaxed text-ink/80 sm:text-2xl">
              {stripHtml(description)}
            </p>
          )}

          {sourceUrl && (
            <p className="mt-8">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block border-b border-ink/40 pb-1 font-mono text-xs uppercase tracking-[0.15em] transition-colors duration-500 hover:border-ink hover:text-accent"
              >
                View at original [+]
              </a>
            </p>
          )}

          <hr className="my-12 border-0 border-t border-ink/15" />

          <Prose content={content} dropCap />
        </div>
      </div>

      {/* Prev / next */}
      {prev && next && (
        <nav
          aria-label="Browse books"
          className="mt-24 grid gap-0 border-y border-ink/15 sm:grid-cols-2"
        >
          <Link
            href={`/book/${prev.slug}`}
            className="group border-b border-ink/15 py-8 sm:border-b-0 sm:border-r sm:pr-8"
          >
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted">
              [ ← Previous ]
            </span>
            <span className="mt-3 block font-serif text-2xl transition-transform duration-500 group-hover:-translate-x-1 sm:text-3xl">
              {prev.title}
            </span>
          </Link>
          <Link href={`/book/${next.slug}`} className="group py-8 sm:pl-8 sm:text-right">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted">
              [ Next → ]
            </span>
            <span className="mt-3 block font-serif text-2xl transition-transform duration-500 group-hover:translate-x-1 sm:text-3xl">
              {next.title}
            </span>
          </Link>
        </nav>
      )}
    </article>
  )
}