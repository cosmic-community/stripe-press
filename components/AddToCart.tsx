import { addToCartAction } from '@/app/store-actions'
import { formatPrice } from '@/lib/pricing'
import SubmitButton from '@/components/SubmitButton'

export default function AddToCart({ slug, priceCents }: { slug: string; priceCents: number | null }) {
  if (priceCents === null) {
    return (
      <p className="mt-8 font-mono text-xs uppercase tracking-[0.15em] text-muted">
        Not available to order here yet
      </p>
    )
  }

  return (
    <form action={addToCartAction} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
      <input type="hidden" name="book" value={slug} />
      <span className="font-serif text-3xl">{formatPrice(priceCents)}</span>
      <SubmitButton
        pendingLabel="Adding…"
        className="border border-ink bg-ink px-5 py-3 font-mono text-xs uppercase tracking-[0.15em] text-paper transition-opacity duration-500 hover:opacity-80"
      >
        Add to cart [+]
      </SubmitButton>
      <span className="font-mono text-xs text-muted">Hardcover · free shipping, no tax</span>
    </form>
  )
}
