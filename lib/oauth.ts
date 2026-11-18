import { randomBytes } from 'node:crypto'
import { kvDel, kvGet, kvSet } from '@/lib/cosmic-store'
import { randomToken, sha256, sign, verify } from '@/lib/crypto-tokens'

// OAuth 2.0 device authorization grant for CAP. Public clients only: no
// registration and no client secret. Refresh tokens rotate on every use.

export const SCOPES = ['read', 'write'] as const
const CLIENT_ID = /^agent:[A-Za-z0-9._:-]{1,64}$/
export const ACCESS_TTL = 60 * 60
export const REFRESH_TTL = 30 * 24 * 60 * 60
export const DEVICE_TTL = 10 * 60
export const POLL_INTERVAL = 5

export function siteOrigin(req: Request): string {
  const configured = process.env.SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  const url = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host
  const proto = ((req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0] ?? 'https').trim()
  return `${proto}://${host}`
}

export function issuer(origin: string): string {
  return `${origin}/oauth`
}

export function capUrl(origin: string): string {
  return `${origin}/cap/v1`
}

export function authServerMetadata(origin: string) {
  return {
    issuer: issuer(origin),
    device_authorization_endpoint: `${issuer(origin)}/device`,
    token_endpoint: `${issuer(origin)}/token`,
    grant_types_supported: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
    response_types_supported: [],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...SCOPES],
    revocation_endpoint: `${issuer(origin)}/revoke`,
    protected_resources: [capUrl(origin)],
  }
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: capUrl(origin),
    authorization_servers: [issuer(origin)],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
  }
}

// An empty request reads. write includes read. Anything else is invalid_scope.
export function normalizeScope(raw: string | null | undefined): { ok: true; scope: string } | { ok: false } {
  const requested = (raw || '').split(/[\s,]+/).filter(Boolean)
  if (!requested.length) return { ok: true, scope: 'read' }
  if (requested.some((scope) => scope !== 'read' && scope !== 'write')) return { ok: false }
  return { ok: true, scope: requested.includes('write') ? 'read write' : 'read' }
}

export function parseClientId(raw: string | null | undefined): string | null {
  const id = (raw || '').trim()
  return CLIENT_ID.test(id) ? id : null
}

export type DeviceRecord = {
  user_code: string
  scope: string
  client: string
  client_name: string
  status: 'pending' | 'approved' | 'denied'
  account?: string
  created: number
}

const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'

function makeUserCode(): string {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += USER_CODE_ALPHABET[(bytes[i] ?? 0) % USER_CODE_ALPHABET.length] ?? 'B'
    if (i === 3) code += '-'
  }
  return code
}

export function normalizeUserCode(raw: string): string {
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '')
  return letters.length === 8 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : ''
}

export async function startDeviceAuthorization(origin: string, scope: string, client: string, clientName: string) {
  const device_code = randomToken(32)
  const user_code = makeUserCode()
  const record: DeviceRecord = {
    user_code,
    scope,
    client,
    client_name: clientName.trim().slice(0, 80),
    status: 'pending',
    created: Date.now(),
  }
  await kvSet(`device:${device_code}`, record, DEVICE_TTL)
  await kvSet(`usercode:${user_code}`, { device_code }, DEVICE_TTL)
  const verification_uri = `${origin}/login/device`
  return {
    device_code,
    user_code,
    verification_uri,
    verification_uri_complete: `${verification_uri}?code=${encodeURIComponent(user_code)}`,
    expires_in: DEVICE_TTL,
    interval: POLL_INTERVAL,
  }
}

export async function findDeviceRequest(
  rawUserCode: string
): Promise<{ device_code: string; record: DeviceRecord } | null> {
  const code = normalizeUserCode(rawUserCode)
  if (!code) return null
  const pointer = await kvGet<{ device_code: string }>(`usercode:${code}`)
  if (!pointer) return null
  const record = await kvGet<DeviceRecord>(`device:${pointer.device_code}`)
  if (!record) return null
  return { device_code: pointer.device_code, record }
}

export async function decideDeviceRequest(rawUserCode: string, account: string, approve: boolean): Promise<boolean> {
  const found = await findDeviceRequest(rawUserCode)
  if (!found || found.record.status !== 'pending') return false
  const remaining = Math.max(30, DEVICE_TTL - Math.floor((Date.now() - found.record.created) / 1000))
  await kvSet(
    `device:${found.device_code}`,
    { ...found.record, status: approve ? 'approved' : 'denied', account },
    remaining
  )
  await kvDel(`usercode:${normalizeUserCode(rawUserCode)}`)
  return true
}

export type TokenResponse =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: { error: string; error_description?: string } }

function tokenError(error: string, description: string, status = 400): TokenResponse {
  return { ok: false, status, body: { error, error_description: description } }
}

type RefreshGrant = { account: string; scope: string; cap_from: string }
type AccessGrant = { account: string; scope: string; cap_from: string }

async function issueTokens(origin: string, account: string, scope: string, capFrom: string) {
  const now = Math.floor(Date.now() / 1000)
  const jti = randomToken(16)
  const access_token = sign({
    typ: 'access',
    iss: issuer(origin),
    aud: capUrl(origin),
    sub: account,
    scope,
    cap_from: capFrom,
    jti,
    iat: now,
    exp: now + ACCESS_TTL,
  })
  await kvSet(`access:${jti}`, { account, scope, cap_from: capFrom } satisfies AccessGrant, ACCESS_TTL)
  const refresh_token = randomToken(32)
  await kvSet(`refresh:${sha256(refresh_token)}`, { account, scope, cap_from: capFrom } satisfies RefreshGrant, REFRESH_TTL)
  return { access_token, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token, scope }
}

export async function exchangeDeviceCode(
  origin: string,
  deviceCode: string | undefined,
  clientId: string | null
): Promise<TokenResponse> {
  if (!deviceCode) return tokenError('invalid_request', 'device_code is required.')
  if (!clientId) return tokenError('invalid_request', 'client_id must be the agent CAP-From, such as agent:example-assistant.')
  const record = await kvGet<DeviceRecord>(`device:${deviceCode}`)
  if (!record) return tokenError('expired_token', 'The device code is unknown or expired. Start a new login.')
  if (record.client !== clientId) return tokenError('invalid_grant', 'client_id does not match the agent that started this login.')
  if (record.status === 'pending') return tokenError('authorization_pending', 'Waiting for the customer to approve.')
  await kvDel(`device:${deviceCode}`)
  if (record.status === 'denied' || !record.account) return tokenError('access_denied', 'The customer declined.')
  return { ok: true, body: await issueTokens(origin, record.account, record.scope, record.client) }
}

export async function exchangeRefreshToken(
  origin: string,
  refreshToken: string | undefined,
  clientId: string | null
): Promise<TokenResponse> {
  if (!refreshToken) return tokenError('invalid_request', 'refresh_token is required.')
  if (!clientId) return tokenError('invalid_request', 'client_id must be the agent CAP-From, such as agent:example-assistant.')
  const key = `refresh:${sha256(refreshToken)}`
  const grant = await kvGet<RefreshGrant>(key)
  if (!grant || grant.cap_from !== clientId) {
    return tokenError('invalid_grant', 'The refresh token is invalid, expired, or already used.')
  }
  await kvDel(key)
  return { ok: true, body: await issueTokens(origin, grant.account, grant.scope, grant.cap_from) }
}

// RFC 7009. The route always answers 200. A token is revoked only for the client it was issued to.
export async function revokeToken(token: string | undefined, clientId: string | null): Promise<void> {
  if (!token || !clientId) return
  const access = verify<{ typ?: string; jti?: string; cap_from?: string }>(token)
  if (access?.typ === 'access' && access.jti && access.cap_from === clientId) {
    await kvDel(`access:${access.jti}`)
    return
  }
  const key = `refresh:${sha256(token)}`
  const grant = await kvGet<RefreshGrant>(key)
  if (grant?.cap_from === clientId) await kvDel(key)
}

export type Grant = { account: string; scope: string[]; capFrom: string }

export async function bearerGrant(req: Request, origin: string): Promise<Grant | null> {
  const match = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const data = verify<{ typ?: string; sub?: string; scope?: string; aud?: string; jti?: string; cap_from?: string }>(
    (match[1] ?? '').trim()
  )
  if (!data || data.typ !== 'access' || !data.sub || !data.jti || !data.cap_from || data.aud !== capUrl(origin)) return null
  const row = await kvGet<AccessGrant>(`access:${data.jti}`)
  if (!row || row.account !== data.sub || row.cap_from !== data.cap_from) return null
  return { account: data.sub, scope: (data.scope || '').split(' ').filter(Boolean), capFrom: data.cap_from }
}
