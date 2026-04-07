export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export async function POST() {
  const { prisma } = await import('../../../../lib/prisma')
  const { requireCurrentUser } = await import('../../../../lib/auth')

  let user
  try {
    user = await requireCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const now = new Date()

  const updated = await prisma.timeEntry.updateMany({
    where: { userId: user.id, clockedOutAt: null },
    data: { clockedOutAt: now }
  })

  if (updated.count === 0) {
    return NextResponse.json({ error: 'No active clock-in found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, clockedOutAt: now.toISOString() })
}
