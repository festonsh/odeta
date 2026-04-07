'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BrandLogo } from './BrandLogo'

type User = { id: number; name: string; role: string } | null

type InitialUser = { id: number; name: string; email?: string; role: string } | null

export function DashboardShell({
  children,
  initialUser = null
}: {
  children: React.ReactNode
  initialUser?: InitialUser
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<User>(
    initialUser ? { id: initialUser.id, name: initialUser.name, role: initialUser.role } : null
  )

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
  }, [])

  const isLoginPage = pathname === '/login'

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className={`dashboard-shell${sidebarOpen ? ' dashboard-shell--sidebar-open' : ''}`}>
      <aside className="dashboard-sidebar">
        <Link
          href="/my-schedule"
          className="logo"
          onClick={() => setSidebarOpen(false)}
        >
          <BrandLogo />
        </Link>
        <nav>
          {user?.role === 'MANAGEMENT' ? (
            <>
              <Link
                href="/management/employees"
                className={pathname.startsWith('/management/employees') ? 'active' : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                Users
              </Link>
              <Link
                href="/management/projects"
                className={pathname === '/management/projects' ? 'active' : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                Projects
              </Link>
              <Link
                href="/management/schedule"
                className={pathname === '/management/schedule' ? 'active' : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                Schedule
              </Link>
              <Link
                href="/management/calendar"
                className={pathname === '/management/calendar' ? 'active' : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                Calendar
              </Link>
              <Link
                href="/admin/time-entries"
                className={pathname === '/admin/time-entries' ? 'active' : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                Time Entries
              </Link>
            </>
          ) : (
            <Link
              href="/my-schedule"
              className={pathname === '/my-schedule' ? 'active' : undefined}
              onClick={() => setSidebarOpen(false)}
            >
              My schedule
            </Link>
          )}
        </nav>
        <div className="sidebar-footer">
          {user && (
            <div className="sidebar-user-info">
              <p className="sidebar-user-name">{user.name}</p>
              <p className="sidebar-user-position">{user.role === 'MANAGEMENT' ? 'Admin' : 'Employee'}</p>
            </div>
          )}
          <form
            action="/api/auth/logout"
            method="post"
            onSubmit={() => setSidebarOpen(false)}
          >
            <button className="logout" type="submit">
              Logout
            </button>
          </form>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          type="button"
          className="dashboard-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <main className="dashboard-main">
        <div className="dashboard-mobile-header">
          <button
            type="button"
            className="dashboard-mobile-menu-button"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <span className="dashboard-mobile-title">
            {pathname === '/my-schedule' ? 'My schedule'
              : pathname === '/admin/time-entries' ? 'Time Entries'
              : pathname === '/management/employees' ? 'Users'
              : pathname === '/management/projects' ? 'Projects'
              : pathname === '/management/schedule' ? 'Schedule'
              : pathname === '/management/calendar' ? 'Calendar'
              : 'A & M Electric Scheduler'}
          </span>
        </div>
        {children}
      </main>
    </div>
  )
}
