'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { addToCart, setQuantity } from '@/lib/cart'
import { startCheckout } from '@/lib/checkout'
import { currentCustomer, endSession, startSession } from '@/lib/customer-session'
import { signUp, verifyCustomer } from '@/lib/customers'
import { decideDeviceRequest } from '@/lib/oauth'

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function safeNext(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function loginUrl(next: string, error?: string): string {
  const params = new URLSearchParams({ next })
  if (error) params.set('error', error)
  return `/login?${params.toString()}`
}

async function requestOrigin(): Promise<string> {
  const configured = process.env.SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const proto = (h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')).split(',')[0].trim()
  return `${proto}://${host}`
}

export async function signInAction(formData: FormData): Promise<void> {
  const next = safeNext(field(formData, 'next'))
  const customer = await verifyCustomer(field(formData, 'username'), field(formData, 'password'))
  if (!customer) redirect(loginUrl(next, 'Wrong username or password.'))
  await startSession(customer.username)
  redirect(next)
}

export async function signUpAction(formData: FormData): Promise<void> {
  const next = safeNext(field(formData, 'next'))
  const result = await signUp({
    username: field(formData, 'username'),
    name: field(formData, 'name'),
    email: field(formData, 'email'),
    password: field(formData, 'password'),
  })
  if (!result.ok) redirect(loginUrl(next, result.error))
  await startSession(result.customer.username)
  redirect(next)
}

export async function signOutAction(): Promise<void> {
  await endSession()
  redirect('/')
}

export async function addToCartAction(formData: FormData): Promise<void> {
  const book = field(formData, 'book')
  const user = await currentCustomer()
  if (!user) redirect(loginUrl(`/book/${book}`))
  const result = await addToCart(user, book, 1)
  if (!result.ok) redirect(`/cart?error=${encodeURIComponent(result.message)}`)
  redirect('/cart')
}

export async function updateQuantityAction(formData: FormData): Promise<void> {
  const user = await currentCustomer()
  if (!user) redirect(loginUrl('/cart'))
  const result = await setQuantity(user, field(formData, 'book'), Number(field(formData, 'quantity')))
  if (!result.ok) redirect(`/cart?error=${encodeURIComponent(result.message)}`)
  redirect('/cart')
}

export async function checkoutAction(): Promise<void> {
  const user = await currentCustomer()
  if (!user) redirect(loginUrl('/cart'))
  const result = await startCheckout(user, await requestOrigin(), 'web')
  if (!result.ok) redirect(`/cart?error=${encodeURIComponent(result.message)}`)
  redirect(result.url)
}

export async function deviceDecisionAction(formData: FormData): Promise<void> {
  const code = field(formData, 'code')
  const user = await currentCustomer()
  if (!user) redirect(loginUrl(`/login/device?code=${encodeURIComponent(code)}`))
  const approve = field(formData, 'decision') === 'approve'
  const ok = await decideDeviceRequest(code, user, approve)
  redirect(`/login/device?done=${ok ? (approve ? 'approved' : 'denied') : 'invalid'}`)
}
