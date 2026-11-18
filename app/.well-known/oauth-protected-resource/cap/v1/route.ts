import { protectedResourceMetadata, siteOrigin } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

export function GET(req: Request): Response {
  return Response.json(protectedResourceMetadata(siteOrigin(req)), {
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' },
  })
}
