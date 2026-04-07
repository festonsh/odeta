export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export async function GET() {
  const { prisma } = await import('../../../../lib/prisma')
  const { requireCurrentUser } = await import('../../../../lib/auth')

  let user
  try {
    user = await requireCurrentUser()
  } catch {
    return NextResponse.json({ active: null }, { status: 401 })
  }

  try {
    const active = await prisma.timeEntry.findFirst({
      where: { userId: user.id, clockedOutAt: null },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { clockedInAt: 'desc' }
    })
    return NextResponse.json({ active: active ?? null })
  } catch {
    // DB not migrated yet — return gracefully
    return NextResponse.json({ active: null })
  }
}
