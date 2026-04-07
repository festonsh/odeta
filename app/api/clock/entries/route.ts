export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

/**
 * Returns completed time entries for the current user.
 * Supports ?from=YYYY-MM-DD&to=YYYY-MM-DD for date filtering.
 * Returns hours broken down by project and work type for reporting.
 */
export async function GET(req: NextRequest) {
  const { prisma } = await import('../../../../lib/prisma')
  const { requireCurrentUser } = await import('../../../../lib/auth')

  let user
  try {
    user = await requireCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: user.id,
      clockedOutAt: { not: null },
      ...(from ? { clockedInAt: { gte: new Date(from) } } : {}),
      ...(to ? { clockedInAt: { lte: new Date(to + 'T23:59:59') } } : {})
    },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { clockedInAt: 'desc' }
  })

  // Compute duration in hours for each entry
  const withHours = entries.map((e) => ({
    ...e,
    hours: e.clockedOutAt
      ? (e.clockedOutAt.getTime() - e.clockedInAt.getTime()) / 3_600_000
      : 0
  }))

  // Aggregate totals by project
  const byProject: Record<string, { projectName: string; hours: number }> = {}
  for (const e of withHours) {
    const key = String(e.projectId)
    if (!byProject[key]) byProject[key] = { projectName: e.project.name, hours: 0 }
    byProject[key].hours += e.hours
  }

  // Aggregate totals by work type
  const byWorkType: Record<string, number> = {}
  for (const e of withHours) {
    byWorkType[e.workType] = (byWorkType[e.workType] ?? 0) + e.hours
  }

  return NextResponse.json({
    entries: withHours,
    totals: {
      byProject: Object.values(byProject),
      byWorkType: Object.entries(byWorkType).map(([workType, hours]) => ({ workType, hours }))
    }
  })
}
