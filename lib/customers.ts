import { getMetafieldValue } from '@/lib/cosmic'
import { findObject, insertObject } from '@/lib/cosmic-store'
import { checkPassword, hashPassword } from '@/lib/crypto-tokens'

export type Customer = { username: string; name: string }

// Demo account that always works, like Marlow's demo guests.
const DEMO_ACCOUNTS = [{ username: 'demo', name: 'Demo Reader', password: 'demo' }]

const USERNAME = /^[a-z0-9][a-z0-9_-]{2,31}$/

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

function customerSlug(username: string): string {
  return `customer-${username}`
}

export async function verifyCustomer(rawUsername: string, password: string): Promise<Customer | null> {
  const username = normalizeUsername(rawUsername)
  const demo = DEMO_ACCOUNTS.find((account) => account.username === username)
  if (demo) return demo.password === password ? { username, name: demo.name } : null
  if (!USERNAME.test(username)) return null
  const object = await findObject('customers', customerSlug(username))
  if (!object) return null
  const stored = getMetafieldValue(object.metadata.passcode_hash)
  return stored && checkPassword(password, stored) ? { username, name: object.title } : null
}

export async function signUp(input: {
  username: string
  name: string
  email: string
  password: string
}): Promise<{ ok: true; customer: Customer } | { ok: false; error: string }> {
  const username = normalizeUsername(input.username)
  if (!USERNAME.test(username)) {
    return { ok: false, error: 'Usernames are 3-32 characters: letters, numbers, - or _.' }
  }
  if (input.password.length < 6) {
    return { ok: false, error: 'Use a password of at least 6 characters.' }
  }
  const email = input.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'That email address does not look right.' }
  }
  if (DEMO_ACCOUNTS.some((account) => account.username === username)) {
    return { ok: false, error: 'That username is taken.' }
  }
  if (await findObject('customers', customerSlug(username))) {
    return { ok: false, error: 'That username is taken.' }
  }
  const name = input.name.trim().slice(0, 80) || username
  await insertObject('customers', customerSlug(username), name, {
    email,
    passcode_hash: hashPassword(input.password),
  })
  return { ok: true, customer: { username, name } }
}
