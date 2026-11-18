import {
  authServerMetadata,
  exchangeDeviceCode,
  exchangeRefreshToken,
  normalizeScope,
  parseClientId,
  revokeToken,
  siteOrigin,
  startDeviceAuthorization,
  type TokenResponse,
} from '@/lib/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ path?: string[] }> }

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, CAP-Version, CAP-From',
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } })
}

async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') || ''
  if (type.includes('application/json')) {
    const data = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) out[key] = String(value)
    }
    return out
  }
  const out: Record<string, string> = {}
  new URLSearchParams(await req.text()).forEach((value, key) => {
    out[key] = value
  })
  return out
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params
  if (path.length === 0 || path[0] === '.well-known') return json(authServerMetadata(siteOrigin(req)))
  return json({ error: 'not_found' }, 404)
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params
  const origin = siteOrigin(req)
  const route = path.join('/')
  const params = await readParams(req)

  if (route === 'device' || route === 'device_authorization') {
    const client = parseClientId(params.client_id)
    if (!client) {
      return json(
        { error: 'invalid_request', error_description: 'client_id must be the agent CAP-From, such as agent:example-assistant.' },
        400
      )
    }
    const scope = normalizeScope(params.scope)
    if (!scope.ok) {
      return json({ error: 'invalid_scope', error_description: 'scope must be read, write, or both. write includes read.' }, 400)
    }
    return json(await startDeviceAuthorization(origin, scope.scope, client, params.client_name || ''))
  }

  if (route === 'token') {
    const client = parseClientId(params.client_id)
    let result: TokenResponse
    if (params.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
      result = await exchangeDeviceCode(origin, params.device_code, client)
    } else if (params.grant_type === 'refresh_token') {
      result = await exchangeRefreshToken(origin, params.refresh_token, client)
    } else {
      result = { ok: false, status: 400, body: { error: 'unsupported_grant_type' } }
    }
    return result.ok ? json(result.body) : json(result.body, result.status)
  }

  if (route === 'revoke') {
    await revokeToken(params.token, parseClientId(params.client_id))
    return json({})
  }

  return json({ error: 'not_found' }, 404)
}
