import Link from 'next/link'
import { getPages } from '@/lib/cosmic'
import { isUtilityPage, utilityRank } from '@/lib/format'

export default async function Footer() {
  let utilityPages: { id: string; slug: string; title: string }[] = []

  try {
    const pages = await getPages()
    utilityPages = pages
      .filter((page) => isUtilityPage(page.slug))
      .sort((a, b) => utilityRank(a.slug) - utilityRank(b.slug))
      .map((page) => ({ id: page.id, slug: page.slug, title: page.title }))
  } catch {
    utilityPages = []
  }

  return (
    <footer className="mx-auto mt-12 w-full max-w-7xl px-5 pb-16 sm:px-8">
      <div className="border-t border-ink/15 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-6">
          <div>
            <p className="font-mono text-sm font-medium uppercase tracking-[0.35em]">
              Stripe Press
            </p>
            <p className="mt-1 font-serif italic text-muted">Ideas for progress</p>
          </div>

          {utilityPages.length > 0 && (
            <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs">
              {utilityPages.map((page) => (
                <Link
                  key={page.id}
                  href={`/${page.slug}`}
                  className="text-muted transition-colors duration-500 hover:text-ink"
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <p className="mt-10 font-mono text-[11px] leading-relaxed text-muted">
          [Esc] home · [←] [→] browse · [ B ]ooks · [ M ]ultimedia
          <span className="mx-2">·</span>© {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}