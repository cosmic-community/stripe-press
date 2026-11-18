import { randomBytes } from 'node:crypto'
import { classifyShop, needsWrite, runShop } from '@/lib/cap-shop'
import { findConfirmation, publicConfirmation, type PublicConfirmation } from '@/lib/cap-confirm'
import { kvGet, kvSet } from '@/lib/cosmic-store'
import { bearerGrant, capUrl, siteOrigin, type Grant } from '@/lib/oauth'

// Questions go to the hosted Cosmic concierge. Cart and checkout stay here,
// and a visiting agent reaches them by sending a message, not by calling routes.

const UPSTREAM = (
  process.env.CAP_UPSTREAM_URL || 'https://dapi.cosmicjs.com/cap/v1/ck_2e04b1b4bd442d6998d3586711375b01'
).replace(/\/$/, '')

const MESSAGE_TTL = 24 * 60 * 60
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
    const shop = await shopMessage(req, origin, from, text)
    if (shop) return shop
    return proxy(req, path, text)
  }
  return proxy(req, path)
}

async function shopMessage(req: Request, origin: string, from: string, text: string): Promise<Response | null> {
  let body: { message?: unknown }
  try {
    body = JSON.parse(text) as { message?: unknown }
  } catch {
    return null
  }
  if (typeof body.message !== 'string' || !body.message.trim()) return null
  const intent = await classifyShop(body.message)
  if (!intent) return null

  const hasAuth = /^Bearer\s+\S+/i.test(req.headers.get('authorization') || '')
  const grant = await bearerGrant(req, origin)
  if (hasAuth && !grant) {
    return capError('unauthorized', 'That login is invalid, expired, or revoked.', 401, {
      'WWW-Authenticate': `Bearer realm="${capUrl(origin)}"`,
    })
  }
  if (grant && grant.capFrom !== from) {
    return capError('forbidden', 'This login was issued to a different agent.', 403)
  }
  if (!grant) {
    return saveAndSend(origin, from, null, {
      status: 'failed',
      error: {
        code: 'login_required',
        message: 'This needs the customer to sign in. Use the device login, with client_id set to your CAP-From, then ask again.',
      },
    })
  }
  if (needsWrite(intent) && !grant.scope.includes('write')) {
    return saveAndSend(origin, from, grant, {
      status: 'failed',
      error: {
        code: 'write_required',
        message: 'This login can read the cart. Ask the customer to sign in again and allow changes.',
      },
    })
  }
  const result = await runShop(body.message, grant.account, from, origin)
  if (!result) return null
  return saveAndSend(origin, from, grant, result)
}

async function saveAndSend(
  origin: string,
  from: string,
  grant: Grant | null,
  result: { status: 'done' | 'failed'; reply?: string; error?: { code: string; message: string }; confirmation?: PublicConfirmation }
): Promise<Response> {
  const now = new Date().toISOString()
  const stored: StoredMessage = {
    id: `msg_${randomBytes(8).toString('hex')}`,
    cap_from: from,
    account: grant?.account ?? null,
    status: result.status,
    reply: result.reply,
    error: result.error,
    confirmation_id: result.confirmation?.id,
    created_at: now,
    finished_at: now,
  }
  await kvSet(`message:${stored.id}`, stored, MESSAGE_TTL)
  return json(await presentMessage(stored, origin))
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
    const text = await upstream.text()
    return new Response(text.split(UPSTREAM).join(ourDoor), { status: upstream.status, headers: out })
  }
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: out })
}
