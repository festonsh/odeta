'use client'

import { format, startOfMonth, subDays } from 'date-fns'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { parseLocalDate, toLocalDateKey } from '../../lib/date-utils'

const WORK_TYPES = ['Electrical', 'Cleaning', 'Labor', 'Plumbing', 'Painting', 'General', 'Other']

type Cell = {
  type: string
  id: number
  projectName: string | null
  address: string | null
  notes: string | null
  workType: string | null
  startTime: string | null
  endTime: string | null
  meetingPoint: string | null
}

type ClockProject = { id: number; name: string }

type ActiveEntry = {
  id: number
  projectId: number
  workType: string
  clockedInAt: string
  project: { id: number; name: string }
}

type EntryRecord = {
  id: number
  projectId: number
  workType: string
  clockedInAt: string
  clockedOutAt: string | null
  hours: number
  project: { id: number; name: string }
}

type MergedGroup = {
  projectId: number
  projectName: string
  workType: string
  totalMs: number
  sessions: { start: Date; end: Date | null }[]
}

type DayHistory = {
  dateKey: string
  groups: MergedGroup[]
  totalMs: number
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function mergeEntries(entries: EntryRecord[]): MergedGroup[] {
  const map = new Map<string, MergedGroup>()
  for (const e of entries) {
    const key = `${e.projectId}::${e.workType}`
    const start = new Date(e.clockedInAt)
    const end = e.clockedOutAt ? new Date(e.clockedOutAt) : null
    const ms = end ? end.getTime() - start.getTime() : Date.now() - start.getTime()
    if (!map.has(key)) {
      map.set(key, { projectId: e.projectId, projectName: e.project.name, workType: e.workType, totalMs: 0, sessions: [] })
    }
    const g = map.get(key)!
    g.totalMs += ms
    g.sessions.push({ start, end })
  }
  return Array.from(map.values())
}

function groupByDay(entries: EntryRecord[]): DayHistory[] {
  const map = new Map<string, EntryRecord[]>()
  for (const e of entries) {
    const dk = format(new Date(e.clockedInAt), 'yyyy-MM-dd')
    if (!map.has(dk)) map.set(dk, [])
    map.get(dk)!.push(e)
  }
  return Array.from(map.entries())
    .map(([dateKey, dayEntries]) => {
      const groups = mergeEntries(dayEntries)
      return { dateKey, groups, totalMs: groups.reduce((s, g) => s + g.totalMs, 0) }
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function sortAssignments(assignments: Cell[]): Cell[] {
  return [...assignments].sort((a, b) => {
    const aTime = a.startTime ?? '99:99'
    const bTime = b.startTime ?? '99:99'
    return aTime.localeCompare(bTime) || a.id - b.id
  })
}

function formatAssignmentTime(assignment: Pick<Cell, 'startTime' | 'endTime'>): string | null {
  return assignment.startTime || assignment.endTime
    ? [assignment.startTime ?? '—', assignment.endTime ?? '—'].join(' – ')
    : null
}

export default function MySchedulePage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [currentMonth] = useState(() => startOfMonth(new Date()))
  const [days, setDays] = useState<string[]>([])
  const [grid, setGrid] = useState<Record<string, Cell[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState<number | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [userName, setUserName] = useState('')

  // Clock in/out state
  const [activeEntry, setActiveEntry] = useState<ActiveEntry | null>(null)
  const [clockProjects, setClockProjects] = useState<ClockProject[]>([])
  const [clockInProject, setClockInProject] = useState('')
  const [clockInWorkType, setClockInWorkType] = useState('')
  const [switchMode, setSwitchMode] = useState(false)
  const [switchProject, setSwitchProject] = useState('')
  const [switchWorkType, setSwitchWorkType] = useState('')
  const [clockBusy, setClockBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [nowTime, setNowTime] = useState(() => new Date())
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nowRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // History state
  const [todayEntries, setTodayEntries] = useState<EntryRecord[]>([])
  const [historyDays, setHistoryDays] = useState<DayHistory[]>([])

  // Auth
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return
        setEmployeeId(typeof data.user?.id === 'number' ? data.user.id : null)
        setUserName(data.user?.name ?? '')
      })
      .catch(() => { if (!cancelled) setEmployeeId(null) })
      .finally(() => { if (!cancelled) setAuthResolved(true) })
    return () => { cancelled = true }
  }, [])

  const fetchEntries = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const from30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')

    fetch(`/api/clock/entries?from=${today}&to=${today}`)
      .then((r) => r.json())
      .then((data) => setTodayEntries(data.entries ?? []))
      .catch(() => setTodayEntries([]))

    fetch(`/api/clock/entries?from=${from30}&to=${today}`)
      .then((r) => r.json())
      .then((data) => setHistoryDays(groupByDay(data.entries ?? [])))
      .catch(() => setHistoryDays([]))
  }, [])

  // Fetch clock status + projects + entries
  useEffect(() => {
    if (!authResolved || employeeId == null) return
    fetch('/api/clock/status')
      .then((r) => r.json())
      .then((data) => setActiveEntry(data.active ?? null))
      .catch(() => setActiveEntry(null))
    fetch('/api/clock/projects')
      .then((r) => r.json())
      .then((data) => setClockProjects(data.projects ?? []))
      .catch(() => setClockProjects([]))
    fetchEntries()
  }, [authResolved, employeeId, fetchEntries])

  // Live elapsed timer while clocked in
  useEffect(() => {
    if (elapsedRef.current) clearInterval(elapsedRef.current)
    if (!activeEntry) { setElapsed(0); return }
    const tick = () => setElapsed(Date.now() - new Date(activeEntry.clockedInAt).getTime())
    tick()
    elapsedRef.current = setInterval(tick, 1000)
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [activeEntry])

  // Live clock when not clocked in
  useEffect(() => {
    if (nowRef.current) clearInterval(nowRef.current)
    if (activeEntry) return
    nowRef.current = setInterval(() => setNowTime(new Date()), 1000)
    return () => { if (nowRef.current) clearInterval(nowRef.current) }
  }, [activeEntry])

  async function handleClockIn() {
    if (!clockInProject || !clockInWorkType) return
    setClockBusy(true)
    try {
      const res = await fetch('/api/clock/in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: Number(clockInProject), workType: clockInWorkType })
      })
      if (!res.ok) return
      const data = await res.json()
      setActiveEntry(data.entry)
      setClockInProject('')
      setClockInWorkType('')
      fetchEntries()
    } finally {
      setClockBusy(false)
    }
  }

  async function handleClockOut() {
    setClockBusy(true)
    try {
      const res = await fetch('/api/clock/out', { method: 'POST' })
      if (res.ok) { setActiveEntry(null); fetchEntries() }
    } finally {
      setClockBusy(false)
    }
  }

  async function handleSwitch() {
    if (!switchProject || !switchWorkType) return
    setClockBusy(true)
    try {
      const res = await fetch('/api/clock/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: Number(switchProject), workType: switchWorkType })
      })
      if (!res.ok) return
      const data = await res.json()
      setActiveEntry(data.entry)
      setSwitchMode(false)
      setSwitchProject('')
      setSwitchWorkType('')
      fetchEntries()
    } finally {
      setClockBusy(false)
    }
  }

  const monthKey = useMemo(() => format(currentMonth, 'yyyy-MM'), [currentMonth])
  const activeMonthKey = useMemo(() => format(startOfMonth(new Date()), 'yyyy-MM'), [])

  useEffect(() => {
    if (!authResolved) return
    if (employeeId == null) { setDays([]); setGrid({}); setExpandedDay(null); setLoading(false); return }
    setLoading(true)
    fetch(`/api/schedule/week?month=${monthKey}&employeeId=${employeeId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => { setDays(data.days ?? []); setGrid((data.grid ?? {})[employeeId] ?? {}); setExpandedDay(null) })
      .catch(() => { setDays([]); setGrid({}) })
      .finally(() => setLoading(false))
  }, [authResolved, employeeId, monthKey])

  const weeks = useMemo(() => {
    const w: string[][] = []
    for (let i = 0; i < days.length; i += 7) w.push(days.slice(i, i + 7))
    return w
  }, [days])

  const mobileDays = useMemo(() => {
    if (monthKey !== activeMonthKey) return days
    const todayKey = toLocalDateKey(new Date())
    const pastDays = days.filter((d) => d < todayKey)
    const recentPastDays = new Set(pastDays.slice(-3))
    return days.filter((d) => d >= todayKey || recentPastDays.has(d))
  }, [activeMonthKey, days, monthKey])

  const isCurrentMonth = (dateKey: string) =>
    parseLocalDate(dateKey).getMonth() === currentMonth.getMonth()

  // Today's merged entries (completed + active)
  const todayAll: EntryRecord[] = activeEntry
    ? [...todayEntries, { id: activeEntry.id, projectId: activeEntry.projectId, workType: activeEntry.workType, clockedInAt: activeEntry.clockedInAt, clockedOutAt: null, hours: elapsed / 3_600_000, project: activeEntry.project }]
    : todayEntries
  const todayMerged = mergeEntries(todayAll)

  // History without today
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const pastDayHistories = historyDays.filter((d) => d.dateKey !== todayKey)

  return (
    <div className="page my-schedule-page">
      <header className="my-schedule-header">
        <h1>My schedule</h1>
      </header>

      {/* ── Clock Widget ───────────────────────────────────── */}
      {!authResolved && (
        <div className="clock-widget clock-widget--out" style={{ opacity: 0.5 }}>
          <div className="clock-widget-center">
            <div className="clock-widget-time" style={{ fontSize: '1rem', color: 'var(--am-text-muted)' }}>Loading…</div>
          </div>
        </div>
      )}
      {authResolved && employeeId == null && (
        <div className="clock-widget clock-widget--out">
          <div className="clock-widget-center">
            <div className="clock-widget-detail">No account linked. Please log in.</div>
          </div>
        </div>
      )}
      {authResolved && employeeId != null && (
        <div className={`clock-widget ${activeEntry ? 'clock-widget--in' : 'clock-widget--out'}`}>
          <div className="clock-widget-left">
            <span className={`clock-badge ${activeEntry ? 'clock-badge--in' : 'clock-badge--out'}`}>
              {activeEntry ? 'IN' : 'OUT'}
            </span>
            {userName && <span className="clock-widget-name">{userName}</span>}
          </div>

          <div className="clock-widget-center">
            {activeEntry ? (
              <>
                <div className="clock-widget-time">{formatElapsed(elapsed)}</div>
                <div className="clock-widget-detail">{activeEntry.project.name} &middot; {activeEntry.workType}</div>
                <div className="clock-widget-since">Since {format(new Date(activeEntry.clockedInAt), 'hh:mm a')}</div>
              </>
            ) : (
              <>
                <div className="clock-widget-time">{format(nowTime, 'hh:mm:ss a')}</div>
                <div className="clock-widget-detail">{format(nowTime, 'EEE, MMM d yyyy')}</div>
              </>
            )}
          </div>

          <div className="clock-widget-right">
            {activeEntry ? (
              switchMode ? (
                <div className="clock-in-form">
                  <select className="clock-select" value={switchProject} onChange={(e) => setSwitchProject(e.target.value)}>
                    <option value="">— Project —</option>
                    {clockProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className="clock-select" value={switchWorkType} onChange={(e) => setSwitchWorkType(e.target.value)}>
                    <option value="">— Work type —</option>
                    {WORK_TYPES.map((wt) => <option key={wt} value={wt}>{wt}</option>)}
                  </select>
                  <button type="button" className="clock-action-btn clock-action-btn--in"
                    onClick={handleSwitch} disabled={clockBusy || !switchProject || !switchWorkType}>Confirm</button>
                  <button type="button" className="clock-action-btn clock-action-btn--cancel"
                    onClick={() => { setSwitchMode(false); setSwitchProject(''); setSwitchWorkType('') }}
                    disabled={clockBusy}>Cancel</button>
                </div>
              ) : (
                <div className="clock-in-form">
                  <button type="button" className="clock-action-btn clock-action-btn--out"
                    onClick={handleClockOut} disabled={clockBusy}>Clock Out</button>
                  <button type="button" className="clock-action-btn clock-action-btn--switch"
                    onClick={() => { setSwitchProject(String(activeEntry.projectId)); setSwitchWorkType(activeEntry.workType); setSwitchMode(true) }}
                    disabled={clockBusy}>Switch Task</button>
                </div>
              )
            ) : (
              <div className="clock-in-form">
                <select className="clock-select" value={clockInProject} onChange={(e) => setClockInProject(e.target.value)}>
                  <option value="">— Select project —</option>
                  {clockProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className="clock-select" value={clockInWorkType} onChange={(e) => setClockInWorkType(e.target.value)}>
                  <option value="">— Work type —</option>
                  {WORK_TYPES.map((wt) => <option key={wt} value={wt}>{wt}</option>)}
                </select>
                <button type="button" className="clock-action-btn clock-action-btn--in"
                  onClick={handleClockIn} disabled={clockBusy || !clockInProject || !clockInWorkType}>Clock In</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Today's Activity ───────────────────────────────── */}
      {authResolved && employeeId != null && todayMerged.length > 0 && (
        <div className="clock-today">
          <div className="clock-today-header">
            <span className="clock-today-title">Today's activity</span>
            <span className="clock-today-total">
              Total: {formatDuration(todayMerged.reduce((s, g) => s + g.totalMs, 0))}
            </span>
          </div>
          <div className="clock-today-table">
            <div className="clock-today-thead">
              <span>Project</span>
              <span>Work type</span>
              <span>Sessions</span>
              <span>Duration</span>
            </div>
            {todayMerged.map((g) => (
              <div key={`${g.projectId}::${g.workType}`} className="clock-today-row">
                <span className="clock-today-project">{g.projectName}</span>
                <span className="clock-today-wtype">{g.workType}</span>
                <span className="clock-today-sessions">
                  {g.sessions.map((s, i) => (
                    <span key={i} className="clock-session-chip">
                      {format(s.start, 'hh:mm a')}
                      {' – '}
                      {s.end ? format(s.end, 'hh:mm a') : <em>active</em>}
                    </span>
                  ))}
                </span>
                <span className="clock-today-dur">{formatDuration(g.totalMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── History Calendar ───────────────────────────────── */}
      {authResolved && employeeId != null && pastDayHistories.length > 0 && (
        <div className="clock-history">
          <h2 className="clock-history-title">History</h2>
          {pastDayHistories.map((day) => (
            <div key={day.dateKey} className="clock-history-day">
              <div className="clock-history-day-header">
                <span className="clock-history-date">
                  {format(parseLocalDate(day.dateKey), 'EEE, MMM d')}
                </span>
                <span className="clock-history-day-total">
                  {formatDuration(day.totalMs)} total
                </span>
              </div>
              <div className="clock-history-entries">
                {day.groups.map((g) => (
                  <div key={`${g.projectId}::${g.workType}`} className="clock-history-entry">
                    <span className="clock-history-project">{g.projectName}</span>
                    <span className="clock-history-wtype">{g.workType}</span>
                    <span className="clock-history-sessions">
                      {g.sessions.map((s, i) => (
                        <span key={i} className="clock-session-chip">
                          {format(s.start, 'hh:mm a')} – {s.end ? format(s.end, 'hh:mm a') : '—'}
                        </span>
                      ))}
                    </span>
                    <span className="clock-history-dur">{formatDuration(g.totalMs)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar — hidden for now */}
      <div style={{ display: 'none' }}>
      {loading ? (
        <p>Loading…</p>
      ) : employeeId == null ? (
        <p>No schedule is available for this account.</p>
      ) : isMobile ? (
        <section className="my-schedule-list">
          {mobileDays.map((dateKey) => {
            const assignments = sortAssignments(grid[dateKey] ?? [])
            const isAssigned = assignments.length > 0
            const isExpanded = expandedDay === dateKey
            const isOtherMonth = !isCurrentMonth(dateKey)
            const primaryLabel = assignments.length === 1 ? assignments[0]?.projectName : `${assignments.length} jobs`
            return (
              <article key={dateKey} className={`my-schedule-list-item ${isOtherMonth ? 'my-schedule-list-item--other-month' : ''}`}>
                <div className="my-schedule-list-item-header">
                  <span className="my-schedule-list-item-day">{format(parseLocalDate(dateKey), 'EEE, MMM d')}</span>
                  {isAssigned ? <span className="my-schedule-list-item-pill">{primaryLabel}</span> : <span className="my-schedule-list-item-unassigned">Unassigned</span>}
                </div>
                {isAssigned && (
                  <>
                    <button type="button" className="my-schedule-show-more" onClick={() => setExpandedDay((d) => (d === dateKey ? null : dateKey))}>
                      {isExpanded ? 'Hide details' : 'Show more info'}
                    </button>
                    {isExpanded && (
                      <div className="my-schedule-info-panel">
                        {assignments.map((assignment) => {
                          const timeStr = formatAssignmentTime(assignment)
                          const jobTitle = [assignment.projectName, timeStr].filter(Boolean).join(' · ')
                          return (
                            <div key={assignment.id} className="my-schedule-assignment-block">
                              <div className="my-schedule-info-panel-title">{jobTitle}</div>
                              {(assignment.workType || assignment.meetingPoint || assignment.address || assignment.notes) && (
                                <div className="my-schedule-info-panel-details">
                                  {assignment.workType && <p>Work: {assignment.workType}</p>}
                                  {assignment.meetingPoint && <p>Meeting: {assignment.meetingPoint}</p>}
                                  {assignment.address && <p>{assignment.address}</p>}
                                  {assignment.notes && <p className="notes">{assignment.notes}</p>}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </article>
            )
          })}
        </section>
      ) : (
        <section className="my-schedule-calendar">
          <div className="my-schedule-calendar-head">
            {WEEKDAY_LABELS.map((label) => <div key={label} className="my-schedule-calendar-head-cell">{label}</div>)}
          </div>
          <div className="my-schedule-calendar-body">
            {weeks.map((weekDays, wi) => (
              <div key={wi} className="my-schedule-calendar-row">
                {weekDays.map((dateKey) => {
                  const assignments = sortAssignments(grid[dateKey] ?? [])
                  const isAssigned = assignments.length > 0
                  const isExpanded = expandedDay === dateKey
                  return (
                    <div key={dateKey} className={`my-schedule-day-cell ${!isCurrentMonth(dateKey) ? 'my-schedule-day-cell--other-month' : ''}`}>
                      <div className="my-schedule-day-num">{format(parseLocalDate(dateKey), 'd')}</div>
                      {isAssigned ? (
                        <div className="my-schedule-day-content">
                          <div className="my-schedule-day-pill-stack">
                            {assignments.slice(0, 2).map((a) => <div key={a.id} className="my-schedule-day-pill">{a.projectName}</div>)}
                            {assignments.length > 2 && <div className="my-schedule-day-pill my-schedule-day-pill--more">+{assignments.length - 2} more</div>}
                          </div>
                          <button type="button" className="my-schedule-show-more" onClick={() => setExpandedDay((d) => (d === dateKey ? null : dateKey))}>
                            {isExpanded ? 'Hide details' : 'Show more info'}
                          </button>
                          {isExpanded && (
                            <div className="my-schedule-info-panel">
                              {assignments.map((assignment) => {
                                const timeStr = formatAssignmentTime(assignment)
                                const jobTitle = [assignment.projectName, timeStr].filter(Boolean).join(' · ')
                                return (
                                  <div key={assignment.id} className="my-schedule-assignment-block">
                                    <div className="my-schedule-info-panel-title">{jobTitle}</div>
                                    {(assignment.workType || assignment.meetingPoint || assignment.address || assignment.notes) && (
                                      <div className="my-schedule-info-panel-details">
                                        {assignment.workType && <p>Work: {assignment.workType}</p>}
                                        {assignment.meetingPoint && <p>Meeting: {assignment.meetingPoint}</p>}
                                        {assignment.address && <p>{assignment.address}</p>}
                                        {assignment.notes && <p className="notes">{assignment.notes}</p>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="my-schedule-unassigned">Unassigned</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </section>
      )}
      </div>{/* end calendar hidden wrapper */}
    </div>
  )
}
