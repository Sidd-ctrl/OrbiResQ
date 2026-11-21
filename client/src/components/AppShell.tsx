import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { placeLabel, usePlatform } from '../state'
import LocationPicker from './LocationPicker'

const NAV = [
  {
    to: '/',
    label: 'Overview',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="3" width="7" height="7" rx="1.4" />
        <rect x="14" y="3" width="7" height="7" rx="1.4" />
        <rect x="3" y="14" width="7" height="7" rx="1.4" />
        <rect x="14" y="14" width="7" height="7" rx="1.4" />
      </svg>
    ),
  },
  {
    to: '/monitoring',
    label: 'Live Monitoring',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.6" />
      </svg>
    ),
  },
  {
    to: '/incidents',
    label: 'Incident Intelligence',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 3.6 21 19H3l9-15.4z" />
        <path d="M12 9v4.6M12 16.4v.1" />
      </svg>
    ),
  },
  {
    to: '/datasets',
    label: 'Datasets & Models',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
        <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    ),
  },
  {
    to: '/system',
    label: 'System',
    icon: (
      <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="17" r="2" />
      </svg>
    ),
  },
]

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <span className="clock">
      {now.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })} ·{' '}
      {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { coords, place, radiusKm, setRadiusKm, radiusOptions, locateState, locateMessage, placeLoading } = usePlatform()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">OR</div>
          <div>
            <div className="brand-name">ORBI RESQ</div>
            <div className="brand-sub">Road Intelligence</div>
          </div>
        </div>

        <nav className="nav" aria-label="Main navigation">
          <div className="nav-label">Operations</div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>Global road intelligence</span>
          <span>Initial market · India</span>
          <span>Emergency dispatch disabled</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="location-block">
            <div className="location-title">
              <span className="dot" style={{ color: 'var(--ok)', width: 7, height: 7 }} />
              {placeLoading ? 'Resolving location…' : placeLabel(place)}
            </div>
            <div className="location-meta">
              {coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'No coordinates set'}
              {place?.source ? ` · ${place.source}` : ''}
            </div>
          </div>

          <div className="topbar-controls">
            <LocationPicker />
            <label className="row" style={{ gap: 6 }}>
              <span className="muted small">Radius</span>
              <select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} aria-label="Search radius">
                {radiusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} km
                  </option>
                ))}
              </select>
            </label>
            <Clock />
          </div>
        </header>

        <main className="content">
          {locateState === 'denied' || locateState === 'error' || locateState === 'unavailable' ? (
            <div className="banner">
              <strong>Location unavailable.</strong>
              <span>{locateMessage}</span>
              <span className="spacer" />
              <span className="small">Use “Search” or “Coordinates” above to set your monitoring area.</span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}
