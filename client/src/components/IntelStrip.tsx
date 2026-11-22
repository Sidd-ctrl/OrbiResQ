import { useState } from 'react'
import { useIntel } from '../intel'
import { relativeTime, titleCase } from '../lib/geo'

export default function IntelStrip() {
  const intel = useIntel()
  const [open, setOpen] = useState(true)

  const totalCameras = intel.cameras.length
  const liveCameras = intel.cameras.filter((camera) => camera.status === 'LIVE').length
  const criticalOpen = intel.summary?.critical_open ?? 0
  const last24h = intel.summary?.last_24h ?? 0
  const recent = [...intel.incidents]
    .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())
    .slice(0, 8)

  return (
    <section className={`intel-strip${open ? '' : ' collapsed'}`} aria-label="Intelligence strip">
      <button
        type="button"
        className="strip-handle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'Collapse intelligence strip' : 'Expand intelligence strip'}
      >
        <span className="mono">{open ? '▾' : '▴'}</span>
        <span className="strip-handle-label mono">INTELLIGENCE</span>
      </button>

      {open ? (
        <div className="strip-body">
          <div className="strip-metrics">
            <div className="strip-metric">
              <span className="mono strip-key">CAMERAS</span>
              <strong>{totalCameras}</strong>
              <span className="mono strip-foot">{liveCameras} live</span>
            </div>
            <div className="strip-metric">
              <span className="mono strip-key">INCIDENTS 24H</span>
              <strong>{last24h}</strong>
              <span className="mono strip-foot">{intel.incidents.length} recorded</span>
            </div>
            <div className="strip-metric">
              <span className="mono strip-key">CRITICAL OPEN</span>
              <strong className={criticalOpen > 0 ? 'alert' : ''}>{criticalOpen}</strong>
              <span className="mono strip-foot">needs review</span>
            </div>
            <div className="strip-metric">
              <span className="mono strip-key">SEISMIC 24H</span>
              <strong>{intel.earthquakes.length}</strong>
              <span className="mono strip-foot">M2.5+</span>
            </div>
          </div>

          <div className="strip-feed">
            <div className="strip-feed-head">
              <span className="mono">LATEST ACTIVITY</span>
              <span className="mono">
                {intel.updatedAt ? `SYNC ${relativeTime(intel.updatedAt).toUpperCase()}` : 'NO SYNC'}
              </span>
            </div>
            {recent.length === 0 ? (
              <p className="hint">No incident activity recorded.</p>
            ) : (
              <ul className="strip-ticker">
                {recent.map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className="ticker-item"
                      onClick={() => intel.select({ kind: 'incident', id: incident.id })}
                    >
                      <span className={`dot ${incident.severity.toLowerCase()}`} aria-hidden="true" />
                      <span className="ticker-category">{titleCase(incident.category)}</span>
                      <span className="ticker-place mono">
                        {[incident.city, incident.state].filter(Boolean).join(', ') || 'Unlocated'}
                      </span>
                      <span className="ticker-time mono">{relativeTime(incident.detected_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="strip-status">
            <div className="strip-feed-head">
              <span className="mono">SYSTEM</span>
              <span className={`mono ${intel.error ? 'warn-text' : 'ok-text'}`}>
                {intel.error ? 'DEGRADED' : intel.health ? intel.health.status.toUpperCase() : 'UNKNOWN'}
              </span>
            </div>
            <ul className="strip-components">
              {(intel.health?.components ?? []).slice(0, 4).map((component) => (
                <li key={component.name}>
                  <span className={`dot ${component.status === 'ok' ? 'live' : 'unverified'}`} aria-hidden="true" />
                  <span className="component-name">{component.name}</span>
                  <span className="mono component-state">{component.status.replace(/_/g, ' ')}</span>
                </li>
              ))}
              {!intel.health ? <li className="hint">Health telemetry unavailable.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  )
}
