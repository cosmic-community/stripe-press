// Book.price is stored in dollars (USD). Everything else works in cents.
export function priceCents(value: unknown): number | null {
  const raw =
    value && typeof value === 'object' && 'value' in value
      ? (value as { value: unknown }).value
      : value
  const amount = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}
