import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import CameraFeed from '../components/CameraFeed'
import MapView from '../components/MapView'
import StatusPill, { DemoPill } from '../components/StatusPill'
import { usePlatform } from '../state'
import type { Camera, DiscoveryResponse, Incident } from '../types'

const STATUS_FILTERS = ['ALL', 'LIVE', 'UNVERIFIED', 'OFFLINE', 'RESTRICTED', 'ARCHIVED'] as const

export default function MonitoringPage() {
  const { coords, radiusKm } = usePlatform()
  const [cameras, setCameras] = useState<Camera[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('ALL')
  const [term, setTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [validating, setValidating] = useState(false)
  const [showIncidents, setShowIncidents] = useState(true)

  const load = useCallback(async () => {
    if (!coords) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [cameraPage, incidentPage] = await Promise.all([
        api.cameras({ latitude: coords.latitude, longitude: coords.longitude, radius_km: radiusKm, page_size: 200 }),
        api.incidents({ page_size: 200 }),
      ])
      setCameras(cameraPage.items)
      setIncidents(incidentPage.items)
      setSelectedId((current) => {
        if (current && cameraPage.items.some((camera) => camera.id === current)) return current
        return cameraPage.items[0]?.id ?? null
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [coords, radiusKm])

  useEffect(() => {
    void load()
  }, [load])

  const runDiscovery = async () => {
    if (!coords) return
    setDiscovering(true)
    setError(null)
    try {
      const result = await api.discover({
        latitude: coords.latitude,
        longitude: coords.longitude,
        radius_km: radiusKm,
        persist: true,
      })
      setDiscovery(result)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDiscovering(false)
    }
  }

  const validateSelected = async (camera: Camera) => {
    setValidating(true)
    setError(null)
    try {
      const updated = await api.validateCamera(camera.id)
      setCameras((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setValidating(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase()
    return cameras.filter((camera) => {
      if (statusFilter !== 'ALL' && camera.status !== statusFilter) return false
      if (!needle) return true
      return [camera.name, camera.provider, camera.city, camera.state, camera.country]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(needle))
    })
  }, [cameras, statusFilter, term])

  const selected = cameras.find((camera) => camera.id === selectedId) ?? filtered[0] ?? null
  const mapIncidents = showIncidents ? incidents : []

  if (!coords) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="empty-title">Set a location to open the live map</div>
            <p>Allow device location or search for a place in the header.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live monitoring</h1>
          <p>Registered and discovered sources with verified connection status. Selecting a source opens its playback panel.</p>
        </div>
        <div className="row">
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={showIncidents}
              onChange={(event) => setShowIncidents(event.target.checked)}
              aria-label="Show incident markers"
            />
            <span className="small">Incident markers</span>
          </label>
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="btn primary" onClick={() => void runDiscovery()} disabled={discovering}>
            {discovering ? <span className="spinner" /> : null}
            Discover sources
          </button>
        </div>
      </div>

      {error ? <div className="notice error" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-body" style={{ padding: 10 }}>
          <MapView
            center={coords}
            cameras={filtered}
            incidents={mapIncidents}
            radiusKm={radiusKm}
            height={480}
            zoom={11}
            selectedCameraId={selected?.id ?? null}
            onSelectCamera={(camera) => setSelectedId(camera.id)}
            onSelectIncident={() => undefined}
          />
        </div>
      </div>

      {discovery ? (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <h2>Discovery providers</h2>
            <span className="hint">{discovery.message ?? `${discovery.total} reachable sources`}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Discovered</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {discovery.providers.map((provider) => (
                  <tr key={provider.id}>
                    <td>{provider.label}</td>
                    <td>
                      <StatusPill
                        value={
                          provider.status === 'ok'
                            ? 'OK'
                            : provider.status === 'not_configured'
                              ? 'NOT_CONFIGURED'
                              : provider.status.toUpperCase()
                        }
                      />
                    </td>
                    <td className="mono">{provider.discovered}</td>
                    <td className="muted small">{provider.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="grid two">
        <div className="panel">
          <div className="panel-head">
            <h2>Camera sources</h2>
            <span className="hint">{filtered.length} shown</span>
          </div>
          <div className="panel-body" style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
            <div className="row">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as (typeof STATUS_FILTERS)[number])}
                aria-label="Filter by status"
              >
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {status === 'ALL' ? 'All statuses' : status}
                  </option>
                ))}
              </select>
              <input
                type="search"
                placeholder="Filter by name, city or provider"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>
          {loading ? (
            <div className="panel-body">
              <div className="skeleton" style={{ width: '75%', marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '55%' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No camera sources match this view</div>
              <p>Try a larger radius, another status, or run source discovery.</p>
            </div>
          ) : (
            <div className="list" style={{ maxHeight: 460, overflowY: 'auto' }}>
              {filtered.map((camera) => (
                <button
                  type="button"
                  key={camera.id}
                  className={`list-item${camera.id === selected?.id ? ' selected' : ''}`}
                  onClick={() => setSelectedId(camera.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: camera.id === selected?.id ? 'var(--accent-soft)' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div className="list-title">
                      {camera.name} <DemoPill show={camera.is_demo} />
                    </div>
                    <div className="list-meta">
                      {[camera.city, camera.state, camera.country].filter(Boolean).join(', ')} · {camera.provider}
                    </div>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                    <StatusPill value={camera.status} />
                    <span className="mono">
                      {camera.distance_km != null ? `${camera.distance_km.toFixed(1)} km` : '—'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>{selected ? selected.name : 'Source detail'}</h2>
            {selected ? <StatusPill value={selected.status} dot /> : null}
          </div>
          <div className="panel-body">
            {!selected ? (
              <div className="empty-state">
                <div className="empty-title">No source selected</div>
                <p>Select a camera from the list or the map to inspect its stream.</p>
              </div>
            ) : (
              <div className="stack" style={{ gap: 14 }}>
                <CameraFeed camera={selected} />

                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void validateSelected(selected)}
                    disabled={validating}
                  >
                    {validating ? <span className="spinner" /> : null}
                    Run connection test
                  </button>
                  {selected.stream_url ? (
                    <a className="btn small" href={selected.stream_url} target="_blank" rel="noreferrer noopener">
                      Open source URL
                    </a>
                  ) : null}
                </div>

                <dl className="kv">
                  <dt>Provider</dt>
                  <dd>{selected.provider}</dd>
                  <dt>Source type</dt>
                  <dd>{selected.source_type.replace(/_/g, ' ')}</dd>
                  <dt>Access</dt>
                  <dd>{selected.access_classification}</dd>
                  <dt>Location</dt>
                  <dd>
                    {[selected.city, selected.district, selected.state, selected.country].filter(Boolean).join(', ') || '—'}
                  </dd>
                  <dt>Coordinates</dt>
                  <dd className="mono">
                    {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                  </dd>
                  <dt>Last validated</dt>
                  <dd>
                    {selected.last_validated_at ? new Date(selected.last_validated_at).toLocaleString() : 'Never tested'}
                    {selected.validation_latency_ms != null ? ` · ${selected.validation_latency_ms} ms` : ''}
                  </dd>
                  <dt>Validation note</dt>
                  <dd>{selected.last_validation_note ?? '—'}</dd>
                  <dt>Attribution</dt>
                  <dd>{selected.attribution ?? 'Not provided by source'}</dd>
                  <dt>Usage restrictions</dt>
                  <dd>{selected.usage_restrictions ?? 'No restriction published with the source'}</dd>
                  <dt>Stream URL</dt>
                  <dd className="mono" style={{ wordBreak: 'break-all' }}>{selected.stream_url ?? '—'}</dd>
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
