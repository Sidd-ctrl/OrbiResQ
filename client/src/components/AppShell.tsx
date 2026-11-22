import type { ReactNode } from 'react'
import TopBar from './TopBar'

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-app">
      <TopBar />
      <main className="page-shell">{children}</main>
    </div>
  )
}
