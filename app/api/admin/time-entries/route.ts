export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/admin/time-entries
 * Management only. Returns all employee time entries.
 * Query params: from, to, employeeId, projectId, workType, status (active|completed|all)
 */
export async function GET(req: NextRequest) {
  const { prisma } = await import('../../../../lib/prisma')
  const { requireManagementUser } = await import('../../../../lib/auth')

  try {
    await requireManagementUser()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const employeeId = searchParams.get('employeeId')
  const projectId = searchParams.get('projectId')
  const workType = searchParams.get('workType')
  const status = searchParams.get('status') ?? 'all' // 'active' | 'completed' | 'all'

  const where: Record<string, unknown> = {}

  if (from) where.clockedInAt = { gte: new Date(from) }
  if (to) {
    where.clockedInAt = {
      ...(where.clockedInAt as object ?? {}),
      lte: new Date(to + 'T23:59:59')
    }
  }
  if (employeeId) where.userId = Number(employeeId)
  if (projectId) where.projectId = Number(projectId)
  if (workType) where.workType = workType
  if (status === 'active') where.clockedOutAt = null
  if (status === 'completed') where.clockedOutAt = { not: null }

  const entries = await prisma.timeEntry.findMany({
    where,
    include: {
      user: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } }
    },
    orderBy: { clockedInAt: 'desc' }
  })

  const withDuration = entries.map((e) => {
    const ms = e.clockedOutAt
      ? e.clockedOutAt.getTime() - e.clockedInAt.getTime()
      : Date.now() - e.clockedInAt.getTime()
    return { ...e, durationMs: ms, durationHours: ms / 3_600_000 }
  })

  // Fetch filter options
  const [employees, projects] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ select: { id: true, name: true }, where: { status: { not: 'ARCHIVED' } }, orderBy: { name: 'asc' } })
  ])

  return NextResponse.json({ entries: withDuration, employees, projects })
}
