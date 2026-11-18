const GITHUB_URL = 'https://github.com/cosmic-community/stripe-press'
const CLONE_URL = 'https://www.cosmicjs.com/community/projects/stripe-press'

export default function DemoBanner({ position }: { position: 'top' | 'bottom' }) {
  return (
    <aside
      role="note"
      aria-label={position === 'top' ? 'Demo disclaimer' : 'Demo disclaimer (footer)'}
      className="w-full border-ink/15 bg-ink text-paper"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-2 text-center font-mono text-[11px] leading-relaxed sm:px-8">
        <p>
          Demo project — not affiliated with, endorsed by, or sponsored by Stripe.
        </p>
        <span aria-hidden="true" className="hidden opacity-50 sm:inline">
          ·
        </span>
        <p className="flex flex-wrap items-center justify-center gap-x-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity duration-300 hover:opacity-70"
          >
            View on GitHub
          </a>
          <a
            href={CLONE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity duration-300 hover:opacity-70"
          >
            Clone this project
          </a>
        </p>
      </div>
    </aside>
  )
}
