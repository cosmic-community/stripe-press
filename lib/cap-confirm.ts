import { randomBytes } from 'node:crypto'
import { cartTotal, type CartLine } from '@/lib/cart'
import { kvGet, kvSet } from '@/lib/cosmic-store'
import { formatPrice } from '@/lib/pricing'

const TTL_SECONDS = 24 * 60 * 60
const PENDING_MS = 10 * 60 * 1000
const MERCHANT = 'Stripe Press'

export type ConfirmationStatus = 'pending' | 'working' | 'done' | 'failed' | 'denied' | 'expired'

type PurchaseItem = {
  name: string
  quantity: number
  unit_price: string
  options?: { format: string }
}

export type ConfirmationRecord = {
  id: string
  cap_from: string
  account: string
  status: ConfirmationStatus
  summary: string
  authorization_details: Array<{
    type: 'purchase'
    merchant: string
    items: PurchaseItem[]
    subtotal: string
    shipping: string
    tax: string
    total: string
    currency: 'USD'
  }>
  lines: CartLine[]
  expires_at: string
  stripe_url?: string
  result?: { message: string; reference?: string }
}

export type PublicConfirmation = {
  id: string
  status: ConfirmationStatus
  url?: string
  summary: string
  authorization_details: ConfirmationRecord['authorization_details']
  expires_at: string
  result?: { message: string; reference?: string }
}

function key(id: string): string {
  return `confirmation:${id}`
}

function decimal(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function confirmUrl(origin: string, id: string): string {
  return `${origin}/confirm/${id}`
}

export function effectiveStatus(record: ConfirmationRecord): ConfirmationStatus {
  if (record.status === 'pending' && Date.parse(record.expires_at) <= Date.now()) return 'expired'
  return record.status
}

export function publicConfirmation(record: ConfirmationRecord, origin: string): PublicConfirmation {
  const status = effectiveStatus(record)
  return {
    id: record.id,
    status,
    ...(status === 'pending' ? { url: confirmUrl(origin, record.id) } : {}),
    summary: record.summary,
    authorization_details: record.authorization_details,
    expires_at: record.expires_at,
    ...((status === 'done' || status === 'failed') && record.result ? { result: record.result } : {}),
  }
}

export async function findConfirmation(id: string): Promise<ConfirmationRecord | null> {
  if (!/^cfm_[a-f0-9]{24}$/.test(id)) return null
  return kvGet<ConfirmationRecord>(key(id))
}

async function saveConfirmation(record: ConfirmationRecord): Promise<void> {
  await kvSet(key(record.id), record, TTL_SECONDS)
}

function latestKey(account: string, capFrom: string): string {
  return `latest-confirmation:${account}:${capFrom}`
}

export async function latestConfirmation(account: string, capFrom: string): Promise<ConfirmationRecord | null> {
  const id = await kvGet<string>(latestKey(account, capFrom))
  if (!id) return null
  const record = await findConfirmation(id)
  if (!record || record.account !== account || record.cap_from !== capFrom) return null
  return record
}

export async function holdPurchase(account: string, capFrom: string, items: CartLine[], origin: string): Promise<ConfirmationRecord> {
  const cents = cartTotal(items)
  const described = items.map((item) => `${item.quantity > 1 ? `${item.quantity} × ` : ''}${item.title}`)
  const summary =
    items.length === 1
      ? `Buy ${described[0]} from ${MERCHANT}. Total ${formatPrice(cents)}, free shipping, no tax.`
      : `Buy ${items.length} books from ${MERCHANT} (${described.join('; ')}). Total ${formatPrice(cents)}, free shipping, no tax.`
  const id = `cfm_${randomBytes(12).toString('hex')}`
  const record: ConfirmationRecord = {
    id,
    cap_from: capFrom,
    account,
    status: 'pending',
    summary,
    authorization_details: [
      {
        type: 'purchase',
        merchant: MERCHANT,
        items: items.map((item) => ({
          name: item.title,
          quantity: item.quantity,
          unit_price: decimal(item.unit_cents),
          options: { format: 'Hardcover' },
        })),
        subtotal: decimal(cents),
        shipping: '0.00',
        tax: '0.00',
        total: decimal(cents),
        currency: 'USD',
      },
    ],
    lines: items,
    expires_at: new Date(Date.now() + PENDING_MS).toISOString(),
  }
  await saveConfirmation(record)
  await kvSet(latestKey(account, capFrom), id, TTL_SECONDS)
  return record
}

export async function markConfirmation(id: string, patch: Partial<ConfirmationRecord>): Promise<ConfirmationRecord | null> {
  const current = await findConfirmation(id)
  if (!current) return null
  const next = { ...current, ...patch, id: current.id }
  await saveConfirmation(next)
  return next
}

export async function settleConfirmation(
  id: string,
  outcome: 'done' | 'failed' | 'expired',
  orderSlug: string
): Promise<void> {
  const current = await findConfirmation(id)
  if (!current || current.status === 'done') return
  if (outcome === 'done') {
    await saveConfirmation({
      ...current,
      status: 'done',
      result: {
        message: `Order ${orderSlug} is paid. A receipt is on its way from Stripe.`,
        reference: orderSlug,
      },
    })
    return
  }
  const message =
    outcome === 'expired'
      ? 'The checkout expired before payment. Ask again to start a new one.'
      : 'The payment did not go through. Nothing was charged.'
  await saveConfirmation({ ...current, status: 'failed', result: { message, reference: orderSlug } })
}
