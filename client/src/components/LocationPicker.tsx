import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { usePlatform } from '../state'
import type { LocationCandidate } from '../types'

export default function LocationPicker() {
  const { useCoordinates, requestLocation, locateState } = usePlatform()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<LocationCandidate[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
        setManualOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const trimmed = term.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      api
        .searchLocations(trimmed)
        .then((found) => {
          if (!cancelled) {
            setResults(found)
            setError(found.length ? null : 'No matching place found. You can enter coordinates instead.')
          }
        })
        .catch((err: Error) => {
          if (!cancelled) {
            setResults([])
            setError(err.message)
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])

  const submitManual = () => {
    const latitude = Number(lat)
    const longitude = Number(lon)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setManualError('Latitude must be between -90 and 90.')
      return
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setManualError('Longitude must be between -180 and 180.')
      return
    }
    setManualError(null)
    setManualOpen(false)
    setOpen(false)
    useCoordinates(latitude, longitude)
  }

  return (
    <div className="row" style={{ gap: 6 }}>
      <div className="search-wrap" ref={wrapRef} style={{ minWidth: 250 }}>
        <input
          type="search"
          aria-label="Search location"
          placeholder="Search city, district or locality"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          style={{ width: '100%' }}
        />
        {open && (results.length > 0 || error || searching) ? (
          <div className="search-results">
            {searching ? <button type="button" disabled>Searching…</button> : null}
            {results.map((candidate) => (
              <button
                type="button"
                key={`${candidate.latitude},${candidate.longitude},${candidate.display_name}`}
                onClick={() => {
                  useCoordinates(candidate.latitude, candidate.longitude)
                  setTerm(candidate.display_name)
                  setOpen(false)
                }}
              >
                <div style={{ fontWeight: 600 }}>{candidate.city ?? candidate.locality ?? candidate.display_name}</div>
                <div className="muted small">{candidate.display_name}</div>
              </button>
            ))}
            {!searching && error ? (
              <button type="button" disabled>
                {error}
              </button>
            ) : null}
          </div>
        ) : null}

        {manualOpen ? (
          <div className="search-results" style={{ padding: 10 }}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="field">
                  <span>Latitude</span>
                  <input type="number" step="0.0001" value={lat} onChange={(event) => setLat(event.target.value)} />
                </label>
                <label className="field">
                  <span>Longitude</span>
                  <input type="number" step="0.0001" value={lon} onChange={(event) => setLon(event.target.value)} />
                </label>
              </div>
              {manualError ? <div className="small" style={{ color: 'var(--critical)' }}>{manualError}</div> : null}
              <button type="button" className="btn primary small" onClick={submitManual}>
                Use these coordinates
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="btn small"
        onClick={requestLocation}
        disabled={locateState === 'locating'}
        title="Request device GPS location"
      >
        {locateState === 'locating' ? <span className="spinner" /> : null}
        Use my location
      </button>

      <button type="button" className="btn small" onClick={() => setManualOpen((value) => !value)}>
        Coordinates
      </button>
    </div>
  )
}
