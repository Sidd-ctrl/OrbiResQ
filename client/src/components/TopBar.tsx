import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { api } from '../api'
import { useIntel } from '../intel'
import { formatClock, formatDay } from '../lib/geo'
import { placeLabel, usePlatform } from '../state'
import type { LocationCandidate } from '../types'

const NAV = [
  { to: '/', label: 'Console', end: true },
  { to: '/incidents', label: 'Incidents' },
  { to: '/datasets', label: 'Datasets' },
  { to: '/system', label: 'System' },
]

export default function TopBar() {
  const { place, placeLoading, locateState, useCoordinates } = usePlatform()
  const { health, unacknowledged, focusOn, select } = useIntel()
  const [now, setNow] = useState(() => new Date())
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocationCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const openSearch = () => {
      setOpen(true)
      setMenuOpen(false)
      window.setTimeout(() => inputRef.current?.focus(), 40)
    }
    window.addEventListener('orbi:search', openSearch)
    return () => window.removeEventListener('orbi:search', openSearch)
  }, [])

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      api
        .searchLocations(term)
        .then((items) => {
          if (!cancelled) setResults(items.slice(0, 6))
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 320)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const choose = (candidate: LocationCandidate) => {
    useCoordinates(candidate.latitude, candidate.longitude)
    focusOn(candidate.latitude, candidate.longitude, 10)
    select(null)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  const statusLabel = health ? health.status.toUpperCase() : 'NO TELEMETRY'
  const statusTone = health ? (health.status === 'ok' ? 'ok' : 'warn') : 'off'

  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="ORBI RESQ console">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-text">
          <strong>ORBI RESQ</strong>
          <em>Road intelligence console</em>
        </span>
      </Link>

      <nav className={`topnav${menuOpen ? ' open' : ''}`} aria-label="Primary">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
            onClick={() => setMenuOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="topbar-search">
        <button type="button" className="search-trigger" onClick={() => setOpen(true)}>
          <span className="search-glyph" aria-hidden="true">
            ⌕
          </span>
          <span className="search-trigger-text">Search India</span>
        </button>
      </div>

      <div className="topbar-meta">
        <button
          type="button"
          className="location-chip"
          onClick={() => focusOn(place?.latitude ?? 0, place?.longitude ?? 0, 10)}
          disabled={!place}
          title={place?.display_name ?? 'Location not resolved yet'}
        >
          <span className={`chip-dot ${locateState}`} aria-hidden="true" />
          <span className="location-text">
            {placeLoading && !place ? 'Resolving location…' : placeLabel(place)}
          </span>
        </button>
        <div className="clock-block">
          <span className="clock mono">{formatClock(now)}</span>
          <span className="clock-date mono">{formatDay(now)} IST</span>
        </div>
        <span className={`status-chip ${statusTone}`} title={health ? `API ${health.status}` : 'Health unavailable'}>
          <span className="status-dot" aria-hidden="true" />
          {statusLabel}
        </span>
        <Link to="/system" className="icon-btn" aria-label="Notifications and system" title="Notifications">
          ✦
          {unacknowledged > 0 ? <span className="badge">{unacknowledged}</span> : null}
        </Link>
        <Link to="/system" className="icon-btn" aria-label="Settings" title="Settings">
          ⚙
        </Link>
        <button
          type="button"
          className="icon-btn menu-btn"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          ☰
        </button>
      </div>

      {open ? (
        <div className="search-overlay" role="dialog" aria-label="Search India">
          <div className="search-field">
            <span className="mono search-label">LOCATION</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="City, district or locality in India"
              aria-label="Search Indian location"
            />
            <button type="button" className="search-close" onClick={() => setOpen(false)}>
              Esc
            </button>
          </div>
          <div className="search-results">
            {searching ? <p className="hint">Searching location registry…</p> : null}
            {!searching && query.trim().length >= 2 && results.length === 0 ? (
              <p className="hint">No matching Indian location found.</p>
            ) : null}
            {results.map((candidate) => (
              <button
                key={`${candidate.latitude}-${candidate.longitude}-${candidate.display_name}`}
                type="button"
                className="search-result"
                onClick={() => choose(candidate)}
              >
                <span className="search-result-name">{candidate.display_name}</span>
                <span className="search-result-meta mono">
                  {[candidate.city, candidate.state, candidate.country].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
            {!searching && query.trim().length < 2 ? (
              <p className="hint">Type at least two characters to search the India location registry.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  )
}
