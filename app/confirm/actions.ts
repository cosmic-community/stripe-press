'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { effectiveStatus, findConfirmation, markConfirmation } from '@/lib/cap-confirm'
import { startCheckout } from '@/lib/checkout'
import { currentCustomer } from '@/lib/customer-session'

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

async function requestOrigin(): Promise<string> {
  const configured = process.env.SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const proto = ((h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0] ?? 'https').trim()
  return `${proto}://${host}`
}

export async function approveConfirmation(formData: FormData): Promise<void> {
  const id = field(formData, 'id')
  const user = await currentCustomer()
  const record = await findConfirmation(id)
  if (!user) redirect(`/login?next=${encodeURIComponent(`/confirm/${id}`)}`)
  if (!record || record.account !== user) redirect(`/confirm/${id}?error=account`)

  const status = effectiveStatus(record)
  if (status === 'working' && record.stripe_url) redirect(record.stripe_url)
  if (status !== 'pending') redirect(`/confirm/${id}?error=closed`)

  const origin = await requestOrigin()
  const result = await startCheckout(user, origin, 'agent', {
    items: record.lines,
    confirmationId: record.id,
    cancelUrl: `${origin}/confirm/${record.id}?canceled=1`,
  })
  if (!result.ok) {
    await markConfirmation(id, { status: 'failed', result: { message: result.message } })
    redirect(`/confirm/${id}?error=pay`)
  }
  await markConfirmation(id, { status: 'working', stripe_url: result.url })
  redirect(result.url)
}

export async function denyConfirmation(formData: FormData): Promise<void> {
  const id = field(formData, 'id')
  const user = await currentCustomer()
  const record = await findConfirmation(id)
  if (!user) redirect(`/login?next=${encodeURIComponent(`/confirm/${id}`)}`)
  if (!record || record.account !== user) redirect(`/confirm/${id}?error=account`)
  if (effectiveStatus(record) === 'pending') await markConfirmation(id, { status: 'denied' })
  redirect(`/confirm/${id}?done=denied`)
}
