import { useMemo, useState } from 'react'
import { api } from '../api'
import { useIntel } from '../intel'
import {
  formatCoordinates,
  formatDistance,
  formatTimestamp,
  haversineKm,
  relativeTime,
  titleCase,
} from '../lib/geo'
import type { Selection } from '../lib/selection'
import { usePlatform } from '../state'
import type { Camera, EarthquakeEvent, Incident } from '../types'
import CameraFeed from './CameraFeed'

interface Props {
  collapsed: boolean
  onToggleCollapse: () => void
  onClose: () => void
}

interface CameraDetailProps {
  camera: Camera
  distanceKm: number | null
  busy: boolean
  onValidate: () => void
  onFocus: () => void
  onClose: () => void
}

function CameraDetail({ camera, distanceKm, busy, onValidate, onFocus, onClose }: CameraDetailProps) {
  return (
    <div className="detail-body">
      <div className="detail-title-row">
        <h2>{camera.name}</h2>
        <span className={`pill ${camera.status.toLowerCase()}`}>{camera.status}</span>
      </div>
      <p className="detail-sub mono">
        {[camera.city, camera.district, camera.state, camera.country].filter(Boolean).join(' · ') || 'Location unrecorded'}
      </p>

      <CameraFeed camera={camera} />

      <dl className="kv">
        <div>
          <dt>Provider</dt>
          <dd>{camera.provider}</dd>
        </div>
        <div>
          <dt>Source type</dt>
          <dd>{titleCase(camera.source_type)}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>{titleCase(camera.access_classification)}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd className="mono">{formatCoordinates(camera.latitude, camera.longitude)}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>{formatDistance(distanceKm)}</dd>
        </div>
        <div>
          <dt>Last validation</dt>
          <dd>{camera.last_validated_at ? formatTimestamp(camera.last_validated_at) : 'Never validated'}</dd>
        </div>
        <div>
          <dt>Validation note</dt>
          <dd>{camera.last_validation_note ?? '—'}</dd>
        </div>
        <div>
          <dt>Incidents</dt>
          <dd>{camera.incident_count}</dd>
        </div>
      </dl>

      {camera.attribution ? <p className="detail-note">Source attribution: {camera.attribution}</p> : null}
      {camera.usage_restrictions ? <p className="detail-note">Usage: {camera.usage_restrictions}</p> : null}

      <div className="detail-actions">
        <button type="button" className="btn primary" onClick={onValidate} disabled={busy}>
          {busy ? 'Testing connection…' : 'Validate connection'}
        </button>
        <button type="button" className="btn" onClick={onFocus}>
          Zoom to source
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

interface IncidentDetailProps {
  incident: Incident
  cameraName: string | null
  busy: boolean
  onVerify: (status: string) => void
  onFocus: () => void
  onCamera: () => void
  onClose: () => void
}

function IncidentDetail({ incident, cameraName, busy, onVerify, onFocus, onCamera, onClose }: IncidentDetailProps) {
  return (
    <div className="detail-body">
      <div className="detail-title-row">
        <h2>{titleCase(incident.category)}</h2>
        <span className={`pill ${incident.severity.toLowerCase()}`}>{incident.severity}</span>
      </div>
      <p className="detail-sub mono">
        {[incident.city, incident.district, incident.state].filter(Boolean).join(' · ') || 'Location unrecorded'} ·{' '}
        {relativeTime(incident.detected_at)}
      </p>

      {incident.evidence_image_url ? (
        <figure className="evidence">
          <img src={incident.evidence_image_url} alt={`Evidence for ${incident.category}`} loading="lazy" />
          <figcaption className="mono">Evidence frame · {formatTimestamp(incident.detected_at)}</figcaption>
        </figure>
      ) : (
        <div className="evidence empty">
          <span className="mono">NO EVIDENCE FRAME</span>
          <p>No evidence image is attached to this record.</p>
        </div>
      )}

      <dl className="kv">
        <div>
          <dt>Verification</dt>
          <dd>
            <span className={`pill ${incident.verification_status}`}>
              {titleCase(incident.verification_status)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{incident.confidence == null ? 'Not scored' : `${Math.round(incident.confidence * 100)}%`}</dd>
        </div>
        <div>
          <dt>Detected</dt>
          <dd>{formatTimestamp(incident.detected_at)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{titleCase(incident.source)}</dd>
        </div>
        <div>
          <dt>Camera</dt>
          <dd>{cameraName ?? 'Not linked'}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd className="mono">{formatCoordinates(incident.latitude, incident.longitude)}</dd>
        </div>
        <div>
          <dt>Video reference</dt>
          <dd className="mono">{incident.video_reference ?? '—'}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd className="mono">{incident.is_demo ? 'DEMO DATA' : 'OPERATIONAL'}</dd>
        </div>
      </dl>

      {incident.description ? <p className="detail-note">{incident.description}</p> : null}

      <div className="detail-actions">
        <button type="button" className="btn primary" onClick={() => onVerify('verified')} disabled={busy}>
          Mark verified
        </button>
        <button type="button" className="btn" onClick={() => onVerify('false_positive')} disabled={busy}>
          False positive
        </button>
        <button type="button" className="btn" onClick={() => onVerify('resolved')} disabled={busy}>
          Resolved
        </button>
      </div>
      <div className="detail-actions">
        <button type="button" className="btn ghost" onClick={onFocus}>
          Zoom to incident
        </button>
        {incident.camera_id ? (
          <button type="button" className="btn ghost" onClick={onCamera}>
            Open camera
          </button>
        ) : null}
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function QuakeDetail({ quake, onClose }: { quake: EarthquakeEvent; onClose: () => void }) {
  return (
    <div className="detail-body">
      <div className="detail-title-row">
        <h2>Magnitude {quake.magnitude?.toFixed(1) ?? '—'}</h2>
        <span className="pill medium">SEISMIC</span>
      </div>
      <p className="detail-sub mono">{quake.place}</p>
      <dl className="kv">
        <div>
          <dt>Occurred</dt>
          <dd>{formatTimestamp(quake.occurred_at)}</dd>
        </div>
        <div>
          <dt>Depth</dt>
          <dd>{quake.depth_km == null ? '—' : `${quake.depth_km.toFixed(1)} km`}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd className="mono">{formatCoordinates(quake.latitude, quake.longitude)}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>USGS earthquake feed</dd>
        </div>
      </dl>
      <div className="detail-actions">
        {quake.url ? (
          <a className="btn" href={quake.url} target="_blank" rel="noreferrer">
            USGS event page
          </a>
        ) : null}
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

interface PlaceDetailProps {
  selection: Extract<Selection, { kind: 'place' }>
  cameraCount: number
  liveCount: number
  incidentCount: number
  onSetLocation: () => void
  onDiscover: () => void
  onClose: () => void
}

function PlaceDetail({
  selection,
  cameraCount,
  liveCount,
  incidentCount,
  onSetLocation,
  onDiscover,
  onClose,
}: PlaceDetailProps) {
  return (
    <div className="detail-body">
      <div className="detail-title-row">
        <h2>{selection.name}</h2>
        <span className="pill neutral">AREA</span>
      </div>
      <p className="detail-sub mono">
        {selection.state ?? 'India'} · {formatCoordinates(selection.center.latitude, selection.center.longitude)}
      </p>
      <div className="detail-stats">
        <div>
          <span className="mono stat-key">CAMERAS</span>
          <strong>{cameraCount}</strong>
        </div>
        <div>
          <span className="mono stat-key">LIVE</span>
          <strong>{liveCount}</strong>
        </div>
        <div>
          <span className="mono stat-key">INCIDENTS</span>
          <strong>{incidentCount}</strong>
        </div>
      </div>
      <p className="detail-note">
        Counts cover registered records within the active search radius of this area centre. Use the actions below to
        adopt this area as your working location.
      </p>
      <div className="detail-actions">
        <button type="button" className="btn primary" onClick={onSetLocation}>
          Set as my location
        </button>
        <button type="button" className="btn" onClick={onDiscover}>
          Discover cameras here
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function LocationDetail({
  onLocate,
  onDiscover,
  onClose,
}: {
  onLocate: () => void
  onDiscover: () => void
  onClose: () => void
}) {
  const { place, coords, radiusKm, locateMessage, locateState } = usePlatform()
  return (
    <div className="detail-body">
      <div className="detail-title-row">
        <h2>My location</h2>
        <span className={`pill ${locateState === 'ready' ? 'live' : 'unverified'}`}>{locateState.toUpperCase()}</span>
      </div>
      <p className="detail-sub mono">{place?.display_name ?? 'Device position'}</p>
      <dl className="kv">
        <div>
          <dt>Coordinates</dt>
          <dd className="mono">{coords ? formatCoordinates(coords.latitude, coords.longitude) : 'Not set'}</dd>
        </div>
        <div>
          <dt>Locality</dt>
          <dd>{place?.locality ?? '—'}</dd>
        </div>
        <div>
          <dt>City</dt>
          <dd>{place?.city ?? '—'}</dd>
        </div>
        <div>
          <dt>District</dt>
          <dd>{place?.district ?? '—'}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{place?.state ?? '—'}</dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>{place?.country ?? '—'}</dd>
        </div>
        <div>
          <dt>Search radius</dt>
          <dd>{radiusKm} km</dd>
        </div>
      </dl>
      {locateMessage ? <p className="detail-note">{locateMessage}</p> : null}
      <div className="detail-actions">
        <button type="button" className="btn primary" onClick={onLocate}>
          Refresh device location
        </button>
        <button type="button" className="btn" onClick={onDiscover}>
          Discover near me
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

export default function DetailPanel({ collapsed, onToggleCollapse, onClose }: Props) {
  const intel = useIntel()
  const { coords, radiusKm, requestLocation, useCoordinates } = usePlatform()
  const [busy, setBusy] = useState<string | null>(null)

  const cameraCount = useMemo(() => {
    if (intel.selection?.kind !== 'place') return 0
    const center = intel.selection.center
    return intel.cameras.filter((camera) => haversineKm(center, camera) <= radiusKm).length
  }, [intel.selection, intel.cameras, radiusKm])

  const liveCount = useMemo(() => {
    if (intel.selection?.kind !== 'place') return 0
    const center = intel.selection.center
    return intel.cameras.filter(
      (camera) => camera.status === 'LIVE' && haversineKm(center, camera) <= radiusKm,
    ).length
  }, [intel.selection, intel.cameras, radiusKm])

  const incidentCount = useMemo(() => {
    if (intel.selection?.kind !== 'place') return 0
    const center = intel.selection.center
    return intel.incidents.filter((incident) => haversineKm(center, incident) <= radiusKm).length
  }, [intel.selection, intel.incidents, radiusKm])

  if (collapsed) {
    return (
      <aside className="floating-panel detail-panel collapsed">
        <button type="button" className="rail-btn" onClick={onToggleCollapse} aria-label="Open detail panel">
          <span className="rail-label mono">DETAIL</span>
          <span className="rail-glyph" aria-hidden="true">
            ⟨
          </span>
        </button>
      </aside>
    )
  }

  const validateCamera = async (camera: Camera) => {
    setBusy(camera.id)
    try {
      await api.validateCamera(camera.id)
      await intel.refresh()
    } finally {
      setBusy(null)
    }
  }

  const updateIncident = async (incident: Incident, status: string) => {
    setBusy(incident.id)
    try {
      await api.updateIncident(incident.id, { verification_status: status })
      await intel.refresh()
    } finally {
      setBusy(null)
    }
  }

  const headline =
    intel.selection?.kind === 'camera'
      ? 'Camera detail'
      : intel.selection?.kind === 'incident'
        ? 'Incident detail'
        : intel.selection?.kind === 'quake'
          ? 'Seismic detail'
          : intel.selection?.kind === 'place'
            ? 'Area detail'
            : intel.selection?.kind === 'location'
              ? 'Location detail'
              : 'Monitoring brief'

  return (
    <aside className="floating-panel detail-panel" aria-label="Detail panel">
      <div className="panel-head">
        <div>
          <h2>{headline}</h2>
          <p className="panel-sub mono">
            {intel.updatedAt ? `SYNC ${relativeTime(intel.updatedAt).toUpperCase()}` : 'AWAITING SYNC'}
          </p>
        </div>
        <div className="head-actions">
          {intel.selection ? (
            <button type="button" className="ghost-btn" onClick={onClose} aria-label="Close selection">
              ×
            </button>
          ) : null}
          <button type="button" className="ghost-btn" onClick={onToggleCollapse} aria-label="Collapse detail panel">
            ⟩
          </button>
        </div>
      </div>

      <div className="panel-scroll">
        {intel.selection?.kind === 'camera' && intel.selectedCamera ? (
          <CameraDetail
            camera={intel.selectedCamera}
            distanceKm={intel.selectedCamera.distance_km}
            busy={busy === intel.selectedCamera.id}
            onValidate={() => void validateCamera(intel.selectedCamera as Camera)}
            onFocus={() =>
              intel.focusOn(intel.selectedCamera!.latitude, intel.selectedCamera!.longitude, 12)
            }
            onClose={onClose}
          />
        ) : null}

        {intel.selection?.kind === 'incident' && intel.selectedIncident ? (
          <IncidentDetail
            incident={intel.selectedIncident}
            cameraName={intel.selectedIncident.camera_name}
            busy={busy === intel.selectedIncident.id}
            onVerify={(status) => void updateIncident(intel.selectedIncident as Incident, status)}
            onFocus={() =>
              intel.focusOn(intel.selectedIncident!.latitude, intel.selectedIncident!.longitude, 13)
            }
            onCamera={() => {
              const cameraId = intel.selectedIncident?.camera_id
              if (cameraId) intel.select({ kind: 'camera', id: cameraId })
            }}
            onClose={onClose}
          />
        ) : null}

        {intel.selection?.kind === 'quake' && intel.selectedQuake ? (
          <QuakeDetail quake={intel.selectedQuake} onClose={onClose} />
        ) : null}

        {intel.selection?.kind === 'place' ? (
          <PlaceDetail
            selection={intel.selection}
            cameraCount={cameraCount}
            liveCount={liveCount}
            incidentCount={incidentCount}
            onSetLocation={() => {
              const center = intel.selection?.kind === 'place' ? intel.selection.center : null
              if (center) {
                useCoordinates(center.latitude, center.longitude)
                intel.focusOn(center.latitude, center.longitude, 9)
              }
            }}
            onDiscover={() => void intel.discover()}
            onClose={onClose}
          />
        ) : null}

        {intel.selection?.kind === 'location' ? (
          <LocationDetail
            onLocate={requestLocation}
            onDiscover={() => void intel.discover()}
            onClose={onClose}
          />
        ) : null}

        {!intel.selection ? (
          <div className="detail-body">
            <div className="brief-head">
              <h3>Nearby coverage</h3>
              <span className="mono">{intel.nearbyCameras.length} in {radiusKm} km</span>
            </div>
            {!coords ? (
              <div className="empty-state">
                <p className="empty-title">Location not set</p>
                <p>Allow device location or search for an Indian city to load nearby coverage.</p>
                <button type="button" className="btn primary" onClick={requestLocation}>
                  Use my location
                </button>
              </div>
            ) : intel.nearbyCameras.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No registered cameras in this radius</p>
                <p>Widen the radius or run discovery to query configured providers.</p>
                <button type="button" className="btn primary" onClick={() => void intel.discover()}>
                  Run discovery
                </button>
              </div>
            ) : (
              <ul className="brief-list">
                {intel.nearbyCameras.slice(0, 6).map((camera) => (
                  <li key={camera.id}>
                    <button
                      type="button"
                      className="brief-row"
                      onClick={() => intel.select({ kind: 'camera', id: camera.id })}
                    >
                      <span className={`dot ${camera.status.toLowerCase()}`} aria-hidden="true" />
                      <span className="brief-copy">
                        <strong>{camera.name}</strong>
                        <em className="mono">
                          {formatDistance(camera.distance_km)} · {camera.provider}
                        </em>
                      </span>
                      <span className="mono brief-tag">{camera.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="brief-head">
              <h3>Recent incidents</h3>
              <span className="mono">{intel.summary?.last_24h ?? 0} in 24 h</span>
            </div>
            {intel.incidents.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">No incident records</p>
                <p>Incidents appear here once the detection pipeline or operators record them.</p>
              </div>
            ) : (
              <ul className="brief-list">
                {[...intel.incidents]
                  .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())
                  .slice(0, 6)
                  .map((incident) => (
                    <li key={incident.id}>
                      <button
                        type="button"
                        className="brief-row"
                        onClick={() => intel.select({ kind: 'incident', id: incident.id })}
                      >
                        <span className={`dot ${incident.severity.toLowerCase()}`} aria-hidden="true" />
                        <span className="brief-copy">
                          <strong>{titleCase(incident.category)}</strong>
                          <em className="mono">
                            {[incident.city, incident.state].filter(Boolean).join(', ') || 'Unlocated'} ·{' '}
                            {relativeTime(incident.detected_at)}
                          </em>
                        </span>
                        <span className="mono brief-tag">{incident.severity}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            <div className="brief-head">
              <h3>My position</h3>
            </div>
            <button
              type="button"
              className="brief-row location-row"
              onClick={() => intel.select({ kind: 'location' })}
            >
              <span className="dot live" aria-hidden="true" />
              <span className="brief-copy">
                <strong>{coords ? formatCoordinates(coords.latitude, coords.longitude) : 'Not set'}</strong>
                <em className="mono">Device geolocation</em>
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
