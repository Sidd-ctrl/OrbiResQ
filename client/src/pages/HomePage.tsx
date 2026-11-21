import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import MapView from '../components/MapView'
import StatusPill, { DemoPill } from '../components/StatusPill'
import { placeLabel, usePlatform } from '../state'
import type { Camera, DiscoveryResponse, Incident, IncidentSummary, NotificationRecord } from '../types'

export default function HomePage() {
  const { coords, place, radiusKm } = usePlatform()
  const [cameras, setCameras] = useState<Camera[]>([])
  const [nearest, setNearest] = useState<Camera[]>([])
  const [summary, setSummary] = useState<IncidentSummary | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [alerts, setAlerts] = useState<NotificationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null)
  const [discovering, setDiscovering] = useState(false)

  const load = useCallback(async () => {
    if (!coords) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [nearbyPage, nearestPage, summaryResult, incidentPage, alertPage] = await Promise.all([
        api.cameras({ latitude: coords.latitude, longitude: coords.longitude, radius_km: radiusKm, page_size: 100 }),
        api.cameras({ latitude: coords.latitude, longitude: coords.longitude, page_size: 8 }),
        api.incidentSummary(),
        api.incidents({ page_size: 5 }),
        api.notifications({ page_size: 6 }),
      ])
      setCameras(nearbyPage.items)
      setNearest(nearestPage.items)
      setSummary(summaryResult)
      setIncidents(incidentPage.items)
      setAlerts(alertPage.items)
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

  const liveCount = cameras.filter((camera) => camera.status === 'LIVE').length
  const statusCounts = cameras.reduce<Record<string, number>>((acc, camera) => {
    acc[camera.status] = (acc[camera.status] ?? 0) + 1
    return acc
  }, {})
  const monitoringPlaces = Array.from(new Set(cameras.map((camera) => camera.city).filter(Boolean))) as string[]
  const outsideRadius = nearest.filter((camera) => !cameras.some((item) => item.id === camera.id))
  const criticalAlerts = alerts.filter(
    (alert) => !alert.acknowledged_at && (alert.severity === 'CRITICAL' || alert.severity === 'HIGH'),
  )

  if (!coords) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="empty-title">Waiting for your location</div>
            <p>
              ORBI RESQ monitors the area around your device. Allow location access or search for a city, district or
              locality in the header to begin.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>
            {placeLabel(place)} · monitoring radius {radiusKm} km · {new Date().toLocaleDateString()}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            Refresh
          </button>
          <button type="button" className="btn primary" onClick={() => void runDiscovery()} disabled={discovering}>
            {discovering ? <span className="spinner" /> : null}
            Search camera sources
          </button>
        </div>
      </div>

      {error ? <div className="notice error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <div className="grid stats" style={{ marginBottom: 14 }}>
        <div className="stat">
          <span className="stat-label">Live cameras in radius</span>
          <span className="stat-value">{loading ? '—' : liveCount}</span>
          <span className="stat-foot">{cameras.length} registered sources within {radiusKm} km</span>
        </div>
        <div className="stat">
          <span className="stat-label">Monitoring locations</span>
          <span className="stat-value">{loading ? '—' : monitoringPlaces.length}</span>
          <span className="stat-foot">
            {monitoringPlaces.length ? monitoringPlaces.slice(0, 3).join(', ') : 'No covered city in radius'}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Incidents · last 24 h</span>
          <span className="stat-value">{loading ? '—' : summary?.last_24h ?? 0}</span>
          <span className="stat-foot">{summary?.total ?? 0} records in the intelligence database</span>
        </div>
        <div className="stat">
          <span className="stat-label">Critical open</span>
          <span className="stat-value">{loading ? '—' : summary?.critical_open ?? 0}</span>
          <span className="stat-foot">Critical incidents not yet resolved</span>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 14 }}>
        <div className="panel">
          <div className="panel-head">
            <h2>Monitoring coverage</h2>
            <Link className="btn ghost small" to="/monitoring">
              Open live map
            </Link>
          </div>
          <div className="panel-body" style={{ padding: 10 }}>
            <MapView center={coords} cameras={cameras} incidents={incidents} radiusKm={radiusKm} height={318} zoom={11} />
          </div>
          <div className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="row" style={{ gap: 14 }}>
              {(['LIVE', 'UNVERIFIED', 'OFFLINE', 'RESTRICTED', 'ARCHIVED'] as const).map((status) => (
                <div key={status} className="row" style={{ gap: 6 }}>
                  <StatusPill value={status} />
                  <span className="mono">{statusCounts[status] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Camera availability</h2>
            <span className="hint">Connection-tested sources only</span>
          </div>
          {loading ? (
            <div className="panel-body">
              <div className="skeleton" style={{ width: '80%', marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '60%' }} />
            </div>
          ) : cameras.length === 0 ? (
            <div className="panel-body">
              <div className="empty-state" style={{ padding: '18px 4px' }}>
                <div className="empty-title">No accessible live camera feeds found in this location.</div>
                <p>
                  ORBI RESQ only lists sources it could reach. Nearest registered cameras are shown below with their
                  actual distance.
                </p>
              </div>
              {outsideRadius.length ? (
                <div className="list">
                  {outsideRadius.slice(0, 4).map((camera) => (
                    <div className="list-item" key={camera.id}>
                      <div>
                        <div className="list-title">{camera.name}</div>
                        <div className="list-meta">
                          {[camera.city, camera.state, camera.country].filter(Boolean).join(', ')} · {camera.provider}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <StatusPill value={camera.status} />
                        <span className="mono">{camera.distance_km != null ? `${camera.distance_km.toFixed(0)} km` : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="list">
              {cameras.slice(0, 6).map((camera) => (
                <div className="list-item" key={camera.id}>
                  <div>
                    <div className="list-title">
                      {camera.name} <DemoPill show={camera.is_demo} />
                    </div>
                    <div className="list-meta">
                      {camera.provider} · {camera.source_type.replace(/_/g, ' ')} ·{' '}
                      {camera.distance_km != null ? `${camera.distance_km.toFixed(1)} km` : 'distance unknown'}
                    </div>
                  </div>
                  <StatusPill value={camera.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {discovery ? (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <h2>Discovery run</h2>
            <span className="hint">
              {discovery.total} source{discovery.total === 1 ? '' : 's'} reachable within {discovery.radius_km} km
            </span>
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
                      <StatusPill value={provider.status === 'ok' ? 'OK' : provider.status === 'not_configured' ? 'NOT_CONFIGURED' : provider.status.toUpperCase()} />
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

      <div className="grid split">
        <div className="panel">
          <div className="panel-head">
            <h2>Recent incidents</h2>
            <Link className="btn ghost small" to="/incidents">
              Incident intelligence
            </Link>
          </div>
          {loading ? (
            <div className="panel-body">
              <div className="skeleton" style={{ width: '70%', marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '50%' }} />
            </div>
          ) : incidents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No incidents recorded</div>
              <p>Incidents appear here after the CV pipeline or an operator records one.</p>
            </div>
          ) : (
            <div className="list">
              {incidents.map((incident) => (
                <div className="list-item" key={incident.id}>
                  <div>
                    <div className="list-title">
                      {incident.category.replace(/_/g, ' ')} <DemoPill show={incident.is_demo} />
                    </div>
                    <div className="list-meta">
                      {new Date(incident.detected_at).toLocaleString()} ·{' '}
                      {[incident.city, incident.state, incident.country].filter(Boolean).join(', ') || 'Location recorded'}
                      {incident.camera_name ? ` · ${incident.camera_name}` : ''}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <StatusPill value={incident.severity} />
                    <StatusPill value={incident.verification_status.toUpperCase()} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Critical alerts</h2>
            <Link className="btn ghost small" to="/system">
              Alert history
            </Link>
          </div>
          {criticalAlerts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No open critical alerts</div>
              <p>Alerts are created only from incident records, never fabricated.</p>
            </div>
          ) : (
            <div className="list">
              {criticalAlerts.map((alert) => (
                <div className="list-item" key={alert.id}>
                  <div>
                    <div className="list-title">{alert.title}</div>
                    <div className="list-meta">
                      {alert.channel} · {new Date(alert.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusPill value={alert.severity} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
