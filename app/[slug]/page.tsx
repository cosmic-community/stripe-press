// app/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMetafieldValue, getPageBySlug } from '@/lib/cosmic'
import { imgixUrl, stripHtml, truncate } from '@/lib/format'
import Prose from '@/components/Prose'

interface GenericPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: GenericPageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await getPageBySlug(slug)
  if (!page) {
    return { title: 'Not found' }
  }
  const description = truncate(stripHtml(getMetafieldValue(page.metadata?.seo_description)), 200)
  const image = imgixUrl(page.metadata?.featured_image?.imgix_url, 'w=1200&h=630&fit=crop&auto=format,compress')
  return {
    title: page.title,
    description: description || undefined,
    openGraph: {
      title: page.title,
      description: description || undefined,
      images: image ? [image] : undefined,
    },
  }
}

export default async function GenericPage({ params }: GenericPageProps) {
  const { slug } = await params
  const page = await getPageBySlug(slug)

  if (!page) {
    notFound()
  }

  const description = getMetafieldValue(page.metadata?.seo_description)
  const sourceUrl = getMetafieldValue(page.metadata?.source_url)
  const content = getMetafieldValue(page.metadata?.content) || page.content || ''
  const image = page.metadata?.featured_image
  const imageSrc = image ? imgixUrl(image.imgix_url, 'w=1800&auto=format,compress') : ''

  return (
    <article className="pb-24 pt-10">
      <header className="max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          [ /{page.slug} ]
        </p>
        <h1 className="mt-4 animate-fade-up font-serif text-5xl font-medium leading-[1.02] tracking-tight sm:text-7xl">
          {page.title}
        </h1>
        {description && (
          <p className="mt-8 max-w-2xl font-serif text-xl italic leading-relaxed text-ink/80 sm:text-2xl">
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
      </header>

      {imageSrc && (
        <figure className="mt-12 max-w-5xl">
          <img
            src={imageSrc}
            alt={page.title}
            width={1800}
            height={1000}
            className="h-auto w-full border border-ink/15"
          />
        </figure>
      )}

      <hr className="my-12 max-w-3xl border-0 border-t border-ink/15" />

      <Prose content={content} />
    </article>
  )
}