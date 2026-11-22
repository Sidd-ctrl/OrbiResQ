import { useEffect, useState } from 'react'
import BottomSheet, { type SheetState } from '../components/BottomSheet'
import DetailPanel from '../components/DetailPanel'
import IntelStrip from '../components/IntelStrip'
import LayerPanel from '../components/LayerPanel'
import MapCanvas, { MAP_STYLE_ORDER, type MapStyleId } from '../components/MapCanvas'
import TopBar from '../components/TopBar'
import { useIntel } from '../intel'
import { formatDistance, relativeTime, titleCase } from '../lib/geo'
import { LAYERS, LAYER_GROUPS } from '../lib/layers'
import { usePlatform } from '../state'

const STYLE_KEY = 'orbi-resq-map-style'

function readStyle(): MapStyleId {
  try {
    const stored = localStorage.getItem(STYLE_KEY)
    if (stored && MAP_STYLE_ORDER.includes(stored as MapStyleId)) return stored as MapStyleId
  } catch {
    return 'charcoal'
  }
  return 'charcoal'
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = () => setMatches(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

export default function WorkspacePage() {
  const intel = useIntel()
  const { coords, radiusKm, setRadiusKm, radiusOptions, requestLocation } = usePlatform()
  const isMobile = useMediaQuery('(max-width: 900px)')

  const [layerCollapsed, setLayerCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [sheetState, setSheetState] = useState<SheetState>('peek')
  const [sheetTab, setSheetTab] = useState('nearby')
  const [mapStyle, setMapStyle] = useState<MapStyleId>(readStyle)

  useEffect(() => {
    try {
      localStorage.setItem(STYLE_KEY, mapStyle)
    } catch {
      return
    }
  }, [mapStyle])

  useEffect(() => {
    if (!isMobile) return
    if (intel.selection) {
      setSheetTab('detail')
      setSheetState('half')
    }
  }, [intel.selection, isMobile])

  const cycleStyle = () => {
    const index = MAP_STYLE_ORDER.indexOf(mapStyle)
    setMapStyle(MAP_STYLE_ORDER[(index + 1) % MAP_STYLE_ORDER.length])
  }

  const openSheet = (tab: string) => {
    setSheetTab(tab)
    setSheetState('half')
  }

  const tabs = [
    ...(intel.selection ? [{ id: 'detail', label: 'Selected' }] : []),
    { id: 'nearby', label: 'Nearby', badge: intel.nearbyCameras.length },
    { id: 'incidents', label: 'Incidents', badge: intel.incidents.length },
    { id: 'layers', label: 'Layers' },
  ]

  return (
    <div className="console">
      <TopBar />

      <div className="console-body">
        <MapCanvas
          cameras={intel.visibleCameras}
          incidents={intel.visibleIncidents}
          earthquakes={intel.layerState.earthquakes ? intel.earthquakes : []}
          precipitation={intel.layerState.rainfall ? intel.precipitation : []}
          userCoords={coords}
          radiusKm={radiusKm}
          showStates={intel.layerState.state_boundaries}
          showRadius={intel.layerState.monitoring_zones}
          showCoverage={intel.layerState.coverage_zones}
          showUser={intel.layerState.my_location}
          showPrecipitation={intel.layerState.rainfall}
          showEarthquakes={intel.layerState.earthquakes}
          selection={intel.selection}
          onSelect={intel.select}
          focusTarget={intel.focusTarget}
          onLocate={requestLocation}
          mapStyle={mapStyle}
          onStyleChange={setMapStyle}
        />

        {!isMobile ? (
          <LayerPanel collapsed={layerCollapsed} onToggleCollapse={() => setLayerCollapsed((v) => !v)} />
        ) : null}

        {!isMobile ? (
          <DetailPanel
            collapsed={detailCollapsed}
            onToggleCollapse={() => setDetailCollapsed((v) => !v)}
            onClose={() => intel.select(null)}
          />
        ) : null}

        {!isMobile ? <IntelStrip /> : null}

        {isMobile ? (
          <>
            <div className="mobile-controls">
              <button type="button" className="map-fab" onClick={() => openSheet('layers')} aria-label="Layers">
                <span aria-hidden="true">◧</span>
                <span className="fab-label mono">LAYERS</span>
              </button>
              <button
                type="button"
                className="map-fab"
                onClick={() => window.dispatchEvent(new Event('orbi:search'))}
                aria-label="Search India"
              >
                <span aria-hidden="true">⌕</span>
                <span className="fab-label mono">SEARCH</span>
              </button>
              <button type="button" className="map-fab" onClick={requestLocation} aria-label="My location">
                <span aria-hidden="true">◎</span>
                <span className="fab-label mono">ME</span>
              </button>
              <button
                type="button"
                className="map-fab"
                onClick={cycleStyle}
                aria-label={`Map style: ${mapStyle}`}
              >
                <span aria-hidden="true">◈</span>
                <span className="fab-label mono">{mapStyle.slice(0, 4).toUpperCase()}</span>
              </button>
            </div>

            <BottomSheet
              state={sheetState}
              onStateChange={setSheetState}
              tabs={tabs}
              active={sheetTab}
              onTab={setSheetTab}
            >
              {sheetTab === 'detail' ? (
                <DetailPanel
                  collapsed={false}
                  onToggleCollapse={() => setSheetState(sheetState === 'full' ? 'half' : 'full')}
                  onClose={() => intel.select(null)}
                />
              ) : null}

              {sheetTab === 'nearby' ? (
                <div className="sheet-pane">
                  <div className="sheet-pane-head">
                    <h3>Nearby cameras</h3>
                    <span className="mono">
                      {intel.nearbyCameras.length} within {radiusKm} km
                    </span>
                  </div>
                  <div className="sheet-radius">
                    {radiusOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`chip${radiusKm === option ? ' active' : ''}`}
                        onClick={() => setRadiusKm(option)}
                      >
                        {option} km
                      </button>
                    ))}
                  </div>
                  {intel.nearbyCameras.length === 0 ? (
                    <div className="empty-state">
                      <p className="empty-title">No accessible live camera feeds found in this location.</p>
                      <p>Widen the radius or run discovery from the layers panel.</p>
                      <button type="button" className="btn primary" onClick={() => void intel.discover()}>
                        Run discovery
                      </button>
                    </div>
                  ) : (
                    <ul className="sheet-list">
                      {intel.nearbyCameras.map((camera) => (
                        <li key={camera.id}>
                          <button
                            type="button"
                            className="sheet-row"
                            onClick={() => intel.select({ kind: 'camera', id: camera.id })}
                          >
                            <span className={`dot ${camera.status.toLowerCase()}`} aria-hidden="true" />
                            <span className="sheet-copy">
                              <strong>{camera.name}</strong>
                              <em className="mono">
                                {formatDistance(camera.distance_km)} · {camera.provider}
                              </em>
                            </span>
                            <span className="mono sheet-tag">{camera.status}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {sheetTab === 'incidents' ? (
                <div className="sheet-pane">
                  <div className="sheet-pane-head">
                    <h3>Incident records</h3>
                    <span className="mono">{intel.incidents.length} total</span>
                  </div>
                  {intel.incidents.length === 0 ? (
                    <div className="empty-state">
                      <p className="empty-title">No incidents recorded</p>
                      <p>Detection pipeline output will appear here.</p>
                    </div>
                  ) : (
                    <ul className="sheet-list">
                      {[...intel.incidents]
                        .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())
                        .map((incident) => (
                          <li key={incident.id}>
                            <button
                              type="button"
                              className="sheet-row"
                              onClick={() => intel.select({ kind: 'incident', id: incident.id })}
                            >
                              <span className={`dot ${incident.severity.toLowerCase()}`} aria-hidden="true" />
                              <span className="sheet-copy">
                                <strong>{titleCase(incident.category)}</strong>
                                <em className="mono">
                                  {[incident.city, incident.state].filter(Boolean).join(', ') || 'Unlocated'} ·{' '}
                                  {relativeTime(incident.detected_at)}
                                </em>
                              </span>
                              <span className="mono sheet-tag">{incident.severity}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {sheetTab === 'layers' ? (
                <div className="sheet-pane">
                  <div className="sheet-pane-head">
                    <h3>Intelligence layers</h3>
                    <button type="button" className="ghost-btn small" onClick={intel.resetLayers}>
                      Reset
                    </button>
                  </div>
                  <div className="sheet-radius">
                    <button
                      type="button"
                      className="btn primary small"
                      onClick={() => void intel.discover()}
                      disabled={intel.discovering || !coords}
                    >
                      {intel.discovering ? 'Testing sources…' : 'Discover cameras'}
                    </button>
                  </div>
                  {intel.discoveryMessage ? <p className="hint">{intel.discoveryMessage}</p> : null}
                  {LAYER_GROUPS.map((group) => (
                    <section key={group.id} className="sheet-group">
                      <h4 className="mono">{group.label.toUpperCase()}</h4>
                      <ul className="sheet-layer-list">
                        {LAYERS.filter((layer) => layer.group === group.id).map((layer) => {
                          const enabled = Boolean(intel.layerState[layer.id])
                          const count = intel.counts[layer.id] ?? 0
                          return (
                            <li key={layer.id}>
                              <button
                                type="button"
                                className={`sheet-layer${enabled ? ' on' : ''}`}
                                onClick={() => intel.toggleLayer(layer.id)}
                                disabled={layer.unavailable}
                                role="switch"
                                aria-checked={enabled}
                              >
                                <span className="sheet-copy">
                                  <strong>{layer.label}</strong>
                                  <em className="mono">{layer.source}</em>
                                </span>
                                <span className="mono sheet-count">{layer.unavailable ? 'N/A' : count}</span>
                                <span className={`switch${enabled ? ' on' : ''}`} aria-hidden="true" />
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : null}
            </BottomSheet>
          </>
        ) : null}

        {intel.error ? (
          <div className="console-alert" role="status">
            <span className="mono">CONNECTION</span>
            <p>{intel.error}</p>
            <button type="button" className="btn small" onClick={() => void intel.refresh()}>
              Retry
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
