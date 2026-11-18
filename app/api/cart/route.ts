import { cartCount, getCart } from '@/lib/cart'
import { currentCustomer } from '@/lib/customer-session'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const user = await currentCustomer()
  if (!user) return Response.json({ signedIn: false, count: 0 }, { headers: { 'Cache-Control': 'no-store' } })
  const items = await getCart(user).catch(() => [])
  return Response.json(
    { signedIn: true, username: user, count: cartCount(items) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
