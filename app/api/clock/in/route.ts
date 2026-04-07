export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

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

  try {
    // Close any existing active entry first (safety net)
    await prisma.timeEntry.updateMany({
      where: { userId: user.id, clockedOutAt: null },
      data: { clockedOutAt: new Date() }
    })

    const entry = await prisma.timeEntry.create({
      data: {
        userId: user.id,
        projectId: body.projectId,
        workType: body.workType,
        notes: body.notes ?? null
      },
      include: { project: { select: { id: true, name: true } } }
    })

    return NextResponse.json({ entry })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'DB error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
