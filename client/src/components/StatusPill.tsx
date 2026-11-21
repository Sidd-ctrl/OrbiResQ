import type { ReactNode } from 'react'

type Tone = 'live' | 'offline' | 'unverified' | 'restricted' | 'archived' | 'critical' | 'high' | 'medium' | 'low' | 'ok' | 'degraded' | 'down' | 'not_configured' | 'demo'

const LABELS: Record<string, string> = {
  LIVE: 'Live',
  OFFLINE: 'Offline',
  UNVERIFIED: 'Unverified',
  RESTRICTED: 'Restricted',
  ARCHIVED: 'Archived',
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  OK: 'Operational',
  DEGRADED: 'Degraded',
  DOWN: 'Down',
  NOT_CONFIGURED: 'Not configured',
  AI_DETECTED: 'AI detected',
  VERIFIED: 'Verified',
  FALSE_POSITIVE: 'False positive',
  RESOLVED: 'Resolved',
  DEMO: 'Demo data',
  UNACKNOWLEDGED: 'Unacknowledged',
  SENT: 'Sent',
  SKIPPED: 'Skipped',
  FAILED: 'Failed',
}

function toneFor(value: string): Tone {
  const key = value.toUpperCase()
  if (key === 'LIVE' || key === 'OK' || key === 'VERIFIED' || key === 'SENT') return 'live'
  if (key === 'OFFLINE' || key === 'DOWN' || key === 'CRITICAL' || key === 'FALSE_POSITIVE' || key === 'FAILED') return 'offline'
  if (key === 'UNVERIFIED' || key === 'DEGRADED' || key === 'HIGH' || key === 'MEDIUM' || key === 'AI_DETECTED') return 'unverified'
  if (key === 'RESTRICTED' || key === 'ARCHIVED' || key === 'NOT_CONFIGURED' || key === 'LOW' || key === 'RESOLVED' || key === 'SKIPPED') return 'restricted'
  return 'restricted'
}

export default function StatusPill({ value, label, dot = false }: { value: string; label?: string; dot?: boolean }) {
  const key = value.toUpperCase()
  return (
    <span className={`pill ${toneFor(value)}`}>
      {dot ? <span className="dot" /> : null}
      {label ?? LABELS[key] ?? value.replace(/_/g, ' ')}
    </span>
  )
}

export function DemoPill({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="pill demo">Demo</span>
}

export function ToneLabel({ children }: { children: ReactNode }) {
  return <span className="muted small">{children}</span>
}
