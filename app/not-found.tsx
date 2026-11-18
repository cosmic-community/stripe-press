import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="py-32 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">[ 404 ]</p>
      <h1 className="mt-6 font-serif text-5xl font-medium tracking-tight sm:text-7xl">
        Not on the shelf
      </h1>
      <p className="mx-auto mt-6 max-w-md font-serif text-xl italic text-muted">
        The page you were looking for has been misplaced, or never existed.
      </p>
      <Link
        href="/"
        className="mt-10 inline-block border-b border-ink/40 pb-1 font-mono text-xs uppercase tracking-[0.15em] transition-colors duration-500 hover:border-ink"
      >
        [Esc] to home
      </Link>
    </section>
  )
}