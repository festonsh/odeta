import './globals.css'
import type { ReactNode } from 'react'
import { AppHeader } from './components/AppHeader'

export const metadata = {
  title: 'OD Scheduler',
  description: 'Internal scheduling app'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="app">
        <AppHeader />
        <main className="main">{children}</main>
      </body>
    </html>
  )
}
