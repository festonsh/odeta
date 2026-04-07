export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

/**
 * Switch project or work type without clocking out.
 * Closes the current active entry and immediately opens a new one.
 */
export async function POST(req: NextRequest) {
  const { prisma } = await import('../../../../lib/prisma')
  const { requireCurrentUser } = await import('../../../../lib/auth')

  let user
  try {
    user = await requireCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as {
    projectId: number
    workType: string
    notes?: string
  } | null

  if (!body?.projectId || !body?.workType) {
    return NextResponse.json({ error: 'projectId and workType are required' }, { status: 400 })
  }

  const now = new Date()

  // Close current active entry
  await prisma.timeEntry.updateMany({
    where: { userId: user.id, clockedOutAt: null },
    data: { clockedOutAt: now }
  })

  // Open new entry immediately
  const entry = await prisma.timeEntry.create({
    data: {
      userId: user.id,
      projectId: body.projectId,
      workType: body.workType,
      clockedInAt: now,
      notes: body.notes ?? null
    },
    include: { project: { select: { id: true, name: true } } }
  })

  return NextResponse.json({ entry })
}
