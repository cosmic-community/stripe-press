import { catalogNote, itemsInReply, type CatalogItem } from '@/lib/cap-shop'
import { findConfirmation, publicConfirmation, type PublicConfirmation } from '@/lib/cap-confirm'
import { kvGet } from '@/lib/cosmic-store'
import { bearerGrant, capUrl, siteOrigin } from '@/lib/oauth'

// Every message goes to the hosted concierge. The catalog is appended so Leo
// can answer prices and lists without this door guessing the intent.

const UPSTREAM = (
  process.env.CAP_UPSTREAM_URL || 'https://dapi.cosmicjs.com/cap/v1/ck_2e04b1b4bd442d6998d3586711375b01'
).replace(/\/$/, '')

const CALLER = /^agent:[A-Za-z0-9._:-]{1,64}$/

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, CAP-Version, CAP-From',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Location, Retry-After',
}

type Ctx = { params: Promise<{ path?: string[] }> }

type StoredMessage = {
  id: string
  cap_from: string
  account: string | null
  status: 'done' | 'failed'
  reply?: string
  error?: { code: string; message: string }
  confirmation_id?: string
  items?: CatalogItem[]
  as_of?: string
  created_at: string
  finished_at: string
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...CORS, 'Cache-Control': 'no-store', ...extra } })
}

function capError(code: string, message: string, status: number, extra: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, extra)
}

function callerFrom(req: Request): string | null {
  if (req.headers.get('cap-version') !== '1.0') return null
  const from = req.headers.get('cap-from') || ''
  return CALLER.test(from) ? from : null
}

export async function handleCap(req: Request, ctx: Ctx): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const { path = [] } = await ctx.params
  const origin = siteOrigin(req)

  if (path[0] === 'confirmations' && path.length === 2 && req.method === 'GET') {
    return readConfirmation(req, origin, path[1] || '')
  }
  if (path[0] === 'messages' && path.length === 2 && req.method === 'GET') {
    const local = await readLocalMessage(req, origin, path[1] || '')
    if (local) return local
  }
  if (path[0] === 'messages' && path.length === 1 && req.method === 'POST') {
    const from = callerFrom(req)
    if (!from) {
      return capError('invalid_request', 'Send CAP-Version: 1.0 and CAP-From: agent:{your-id}.', 400)
    }
    const text = await req.text()
    return proxy(req, path, await withCatalog(text, origin))
  }
  return proxy(req, path)
}

const MAX_MESSAGE = 2000

async function withCatalog(text: string, origin: string): Promise<string> {
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    return text
  }
  if (typeof body.message !== 'string' || !body.message.trim()) return text
  const note = await catalogNote(origin, MAX_MESSAGE - body.message.length - 2)
  if (!note) return text
  return JSON.stringify({ ...body, message: `${body.message}\n\n${note}` })
}

async function presentMessage(stored: StoredMessage, origin: string) {
  let confirmation: PublicConfirmation | undefined
  if (stored.confirmation_id) {
    const record = await findConfirmation(stored.confirmation_id)
    if (record) confirmation = publicConfirmation(record, origin)
  }
  return {
    id: stored.id,
    status: stored.status,
    ...(stored.reply ? { reply: stored.reply } : {}),
    ...(stored.error ? { error: stored.error } : {}),
    ...(confirmation ? { confirmation } : {}),
    ...(stored.items?.length ? { items: stored.items, as_of: stored.as_of } : {}),
    created_at: stored.created_at,
    finished_at: stored.finished_at,
  }
}

async function readLocalMessage(req: Request, origin: string, id: string): Promise<Response | null> {
  const stored = await kvGet<StoredMessage>(`message:${id}`)
  if (!stored) return null
  const from = callerFrom(req)
  if (!from) return capError('invalid_request', 'Send CAP-Version: 1.0 and CAP-From: agent:{your-id}.', 400)
  const grant = await bearerGrant(req, origin)
  if (stored.cap_from !== from) return capError('not_found', 'That message is not available.', 404)
  if (stored.account && (!grant || grant.account !== stored.account || grant.capFrom !== from)) {
    return capError('not_found', 'That message is not available.', 404)
  }
  return json(await presentMessage(stored, origin))
}

async function readConfirmation(req: Request, origin: string, id: string): Promise<Response> {
  const from = callerFrom(req)
  if (!from) return capError('invalid_request', 'Send CAP-Version: 1.0 and CAP-From: agent:{your-id}.', 400)
  const grant = await bearerGrant(req, origin)
  const record = await findConfirmation(id)
  if (!record || record.cap_from !== from || !grant || grant.account !== record.account || grant.capFrom !== from) {
    return capError('not_found', 'That confirmation is not available.', 404)
  }
  const view = publicConfirmation(record, origin)
  const waiting = view.status === 'pending' || view.status === 'working'
  return json(view, 200, waiting ? { 'Retry-After': '5' } : {})
}

async function withPricedItems(text: string, origin: string): Promise<string> {
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    return text
  }
  if (body.status !== 'done' || typeof body.reply !== 'string') return text
  const priced = await itemsInReply(body.reply, origin)
  if (!priced.items.length) return text
  return JSON.stringify({ ...body, items: priced.items, as_of: priced.as_of })
}

async function proxy(req: Request, path: string[], body?: string): Promise<Response> {
  const origin = siteOrigin(req)
  const incoming = new URL(req.url)
  const target = `${UPSTREAM}${path.length ? '/' + path.map(encodeURIComponent).join('/') : ''}${incoming.search}`
  const headers = new Headers()
  req.headers.forEach((value, name) => {
    const key = name.toLowerCase()
    if (key.startsWith('cap-') || ['content-type', 'accept', 'accept-language'].includes(key)) {
      headers.set(name, value)
    }
  })
  const init: RequestInit = { method: req.method, headers, redirect: 'manual' }
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = body ?? (await req.text())

  let upstream: Response
  try {
    upstream = await fetch(target, init)
  } catch {
    return capError('unavailable', 'The concierge is unreachable right now. Try again shortly.', 503)
  }

  const out = new Headers(CORS)
  const ourDoor = capUrl(origin)
  upstream.headers.forEach((value, name) => {
    const key = name.toLowerCase()
    if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) return
    if (key.startsWith('access-control-')) return
    out.set(name, key === 'location' ? value.split(UPSTREAM).join(ourDoor) : value)
  })
  out.set('cache-control', 'no-store')
  if (upstream.status === 204 || upstream.status === 304) {
    return new Response(null, { status: upstream.status, headers: out })
  }
  const type = upstream.headers.get('content-type') || ''
  if (/json|text|html/.test(type)) {
    let text = (await upstream.text()).split(UPSTREAM).join(ourDoor)
    if (/json/.test(type)) text = await withPricedItems(text, origin)
    return new Response(text, { status: upstream.status, headers: out })
  }
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: out })
}
