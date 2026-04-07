export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

/** Returns active projects for the clock-in selector. Any authenticated user can call this. */
export async function GET() {
  const { prisma } = await import('../../../../lib/prisma')
  const { requireCurrentUser } = await import('../../../../lib/auth')

  try {
    await requireCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })

  return NextResponse.json({ projects })
}
