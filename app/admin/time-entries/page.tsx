'use client'

import { format } from 'date-fns'
import { useEffect, useState } from 'react'

type Entry = {
  id: number
  durationMs: number
  durationHours: number
  clockedInAt: string
  clockedOutAt: string | null
  workType: string
  user: { id: number; name: string }
  project: { id: number; name: string }
}

type FilterOption = { id: number; name: string }

const WORK_TYPES = ['Electrical', 'Cleaning', 'Labor', 'Plumbing', 'Painting', 'General', 'Other']

function fmtExact(iso: string) {
  return format(new Date(iso), 'MMM d, yyyy hh:mm:ss a')
}

function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtDecimal(hours: number): string {
  return hours.toFixed(2) + ' hrs'
}

export default function AdminTimeEntriesPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [employees, setEmployees] = useState<FilterOption[]>([])
  const [projects, setProjects] = useState<FilterOption[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  // Filters
  const today = format(new Date(), 'yyyy-MM-dd')
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return format(d, 'yyyy-MM-dd')
  })
  const [to, setTo] = useState(today)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  function buildUrl() {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (filterEmployee) p.set('employeeId', filterEmployee)
    if (filterProject) p.set('projectId', filterProject)
    if (filterWorkType) p.set('workType', filterWorkType)
    if (filterStatus !== 'all') p.set('status', filterStatus)
    return `/api/admin/time-entries?${p.toString()}`
  }

  function load() {
    setLoading(true)
    fetch(buildUrl())
      .then((r) => {
        if (r.status === 403) { setForbidden(true); return null }
        return r.json()
      })
      .then((data) => {
        if (!data) return
        setEntries(data.entries ?? [])
        setEmployees(data.employees ?? [])
        setProjects(data.projects ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const totalHours = entries.reduce((s, e) => s + e.durationHours, 0)
  const activeCount = entries.filter((e) => !e.clockedOutAt).length

  if (forbidden) {
    return (
      <div className="page">
        <h1>Access denied</h1>
        <p>This page is only accessible to management users.</p>
      </div>
    )
  }

  return (
    <div className="page te-page">
      <div className="te-header">
        <div>
          <h1 className="te-title">Time Entries</h1>
          <p className="te-subtitle">All employee clock-ins, clock-outs and task changes</p>
        </div>
        {!loading && (
          <div className="te-summary-chips">
            <span className="te-chip">{entries.length} entries</span>
            <span className="te-chip te-chip--hours">{totalHours.toFixed(2)} hrs total</span>
            {activeCount > 0 && (
              <span className="te-chip te-chip--active">{activeCount} active</span>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="te-filters">
        <div className="te-filter-group">
          <label className="te-filter-label">From</label>
          <input type="date" className="te-filter-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="te-filter-group">
          <label className="te-filter-label">To</label>
          <input type="date" className="te-filter-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="te-filter-group">
          <label className="te-filter-label">Employee</label>
          <select className="te-filter-input" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="te-filter-group">
          <label className="te-filter-label">Project</label>
          <select className="te-filter-input" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="te-filter-group">
          <label className="te-filter-label">Work type</label>
          <select className="te-filter-input" value={filterWorkType} onChange={(e) => setFilterWorkType(e.target.value)}>
            <option value="">All types</option>
            {WORK_TYPES.map((wt) => <option key={wt} value={wt}>{wt}</option>)}
          </select>
        </div>
        <div className="te-filter-group">
          <label className="te-filter-label">Status</label>
          <select className="te-filter-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <button type="button" className="te-apply-btn" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="te-loading">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="te-empty">No entries found for the selected filters.</p>
      ) : (
        <div className="te-table-wrap">
          <table className="te-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Project</th>
                <th>Work type</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Duration</th>
                <th>Decimal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={!e.clockedOutAt ? 'te-row--active' : ''}>
                  <td className="te-cell-name">{e.user.name}</td>
                  <td className="te-cell-project">{e.project.name}</td>
                  <td><span className="te-wtype-badge">{e.workType}</span></td>
                  <td className="te-cell-time">{fmtExact(e.clockedInAt)}</td>
                  <td className="te-cell-time">
                    {e.clockedOutAt ? fmtExact(e.clockedOutAt) : <span className="te-active-label">Active</span>}
                  </td>
                  <td className="te-cell-dur">{fmtDuration(e.durationMs)}</td>
                  <td className="te-cell-decimal">{fmtDecimal(e.durationHours)}</td>
                  <td>
                    {e.clockedOutAt
                      ? <span className="te-status te-status--done">Done</span>
                      : <span className="te-status te-status--live">● Live</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
