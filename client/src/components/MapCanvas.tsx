import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { INDIA_BOUNDS, INDIA_CENTER, formatCoordinates } from '../lib/geo'
import type { FocusTarget, Selection } from '../lib/selection'
import type { Camera, EarthquakeEvent, Incident, PrecipitationPoint } from '../types'

export type MapStyleId = 'charcoal' | 'satellite' | 'slate'

export const MAP_STYLES: Record<MapStyleId, { label: string; url: string; attribution: string; maxZoom: number }> = {
  charcoal: {
    label: 'Charcoal',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors · © CARTO',
    maxZoom: 19,
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri · Maxar · Earthstar Geographics',
    maxZoom: 18,
  },
  slate: {
    label: 'Slate',
    url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors · © CARTO',
    maxZoom: 19,
  },
}

export const MAP_STYLE_ORDER: MapStyleId[] = ['charcoal', 'satellite', 'slate']

const INDIA_LATLNG = L.latLngBounds(INDIA_BOUNDS[0], INDIA_BOUNDS[1])

const SEVERITY_COLOR: Record<string, string> = {
  LOW: '#7f8a76',
  MEDIUM: '#c8a061',
  HIGH: '#c07a4a',
  CRITICAL: '#b4453a',
}

interface Props {
  cameras: Camera[]
  incidents: Incident[]
  earthquakes: EarthquakeEvent[]
  precipitation: PrecipitationPoint[]
  userCoords: { latitude: number; longitude: number } | null
  radiusKm: number
  showStates: boolean
  showRadius: boolean
  showCoverage: boolean
  showUser: boolean
  showPrecipitation: boolean
  showEarthquakes: boolean
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  focusTarget: FocusTarget | null
  onLocate: () => void
  mapStyle: MapStyleId
  onStyleChange: (style: MapStyleId) => void
}

let boundaryCache: Promise<GeoJSON.FeatureCollection> | null = null

function loadBoundaries(): Promise<GeoJSON.FeatureCollection> {
  if (!boundaryCache) {
    boundaryCache = fetch('/geo/india-states.geojson').then((response) => {
      if (!response.ok) throw new Error(`Boundary dataset unavailable (${response.status})`)
      return response.json() as Promise<GeoJSON.FeatureCollection>
    })
    boundaryCache.catch(() => {
      boundaryCache = null
    })
  }
  return boundaryCache
}

function tooltipElement(title: string, meta: string): HTMLElement {
  const wrapper = document.createElement('div')
  const heading = document.createElement('span')
  heading.className = 'map-tooltip-title'
  heading.textContent = title
  const detail = document.createElement('span')
  detail.className = 'map-tooltip-meta'
  detail.textContent = meta
  wrapper.append(heading, detail)
  return wrapper
}

function cameraMarker(camera: Camera, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: 'marker-shell',
    html: `<span class="cam-marker ${camera.status.toLowerCase()}${selected ? ' is-selected' : ''}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function userMarker(): L.DivIcon {
  return L.divIcon({
    className: 'marker-shell',
    html: '<span class="user-marker"><span class="user-pulse"></span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

export default function MapCanvas({
  cameras,
  incidents,
  earthquakes,
  precipitation,
  userCoords,
  radiusKm,
  showStates,
  showRadius,
  showCoverage,
  showUser,
  showPrecipitation,
  showEarthquakes,
  selection,
  onSelect,
  focusTarget,
  onLocate,
  mapStyle,
  onStyleChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const groupsRef = useRef<Record<string, L.LayerGroup>>({})
  const handlersRef = useRef({ onSelect })
  const [styleMenu, setStyleMenu] = useState(false)
  const [boundaryError, setBoundaryError] = useState<string | null>(null)

  handlersRef.current = { onSelect }

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return
    const map = L.map(container, {
      center: INDIA_CENTER,
      zoom: 5,
      minZoom: 3.75,
      maxZoom: 15,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBounds: INDIA_LATLNG.pad(0.08),
      maxBoundsViscosity: 1,
      attributionControl: false,
      zoomControl: false,
      worldCopyJump: false,
      preferCanvas: true,
    })
    mapRef.current = map
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map)
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 110 }).addTo(map)
    for (const name of ['states', 'coverage', 'precip', 'quake', 'incident', 'camera', 'user', 'radius']) {
      groupsRef.current[name] = L.layerGroup().addTo(map)
    }
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      groupsRef.current = {}
      tileRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileRef.current) map.removeLayer(tileRef.current)
    const config = MAP_STYLES[mapStyle]
    const tiles = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
      detectRetina: true,
    })
    tiles.addTo(map)
    tileRef.current = tiles
  }, [mapStyle])

  useEffect(() => {
    const group = groupsRef.current.states
    if (!group) return
    group.clearLayers()
    setBoundaryError(null)
    if (!showStates) return
    let cancelled = false
    loadBoundaries()
      .then((data) => {
        if (cancelled || !groupsRef.current.states) return
        const layer = L.geoJSON(data, {
          style: {
            color: '#5f646a',
            weight: 1,
            opacity: 0.85,
            fillColor: '#c8a061',
            fillOpacity: 0.02,
          },
          onEachFeature: (feature, featureLayer) => {
            const properties = (feature.properties ?? {}) as Record<string, unknown>
            const name = String(properties.ST_NM ?? properties.NAME_1 ?? properties.name ?? 'State')
            featureLayer.bindTooltip(tooltipElement(name, 'State boundary'), {
              sticky: true,
              className: 'map-tooltip',
            })
            featureLayer.on('click', () => {
              const polygon = featureLayer as L.Polygon
              const center = polygon.getBounds().getCenter()
              handlersRef.current.onSelect({
                kind: 'place',
                id: `state:${name}`,
                name,
                center: { latitude: center.lat, longitude: center.lng },
              })
            })
          },
        })
        layer.addTo(group)
      })
      .catch((caught: Error) => {
        if (!cancelled) setBoundaryError(caught.message)
      })
    return () => {
      cancelled = true
    }
  }, [showStates])

  useEffect(() => {
    const group = groupsRef.current.camera
    if (!group) return
    group.clearLayers()
    for (const camera of cameras) {
      const selected = selection?.kind === 'camera' && selection.id === camera.id
      const marker = L.marker([camera.latitude, camera.longitude], {
        icon: cameraMarker(camera, selected),
        title: camera.name,
        keyboard: true,
      })
      marker.bindTooltip(tooltipElement(camera.name, `${camera.status} · ${camera.provider}`), {
        direction: 'top',
        offset: [0, -10],
        className: 'map-tooltip',
      })
      marker.on('click', () => handlersRef.current.onSelect({ kind: 'camera', id: camera.id }))
      marker.addTo(group)
    }
  }, [cameras, selection])

  useEffect(() => {
    const group = groupsRef.current.incident
    if (!group) return
    group.clearLayers()
    for (const incident of incidents) {
      const selected = selection?.kind === 'incident' && selection.id === incident.id
      const color = SEVERITY_COLOR[incident.severity] ?? '#c8a061'
      const marker = L.circleMarker([incident.latitude, incident.longitude], {
        radius: selected ? 9 : 6,
        color,
        weight: selected ? 2 : 1.2,
        opacity: 1,
        fillColor: color,
        fillOpacity: selected ? 0.75 : 0.45,
      })
      marker.bindTooltip(
        tooltipElement(
          incident.category.replace(/_/g, ' '),
          `${incident.severity} · ${incident.verification_status.replace(/_/g, ' ')}`,
        ),
        { direction: 'top', offset: [0, -6], className: 'map-tooltip' },
      )
      marker.on('click', () => handlersRef.current.onSelect({ kind: 'incident', id: incident.id }))
      marker.addTo(group)
    }
  }, [incidents, selection])

  useEffect(() => {
    const group = groupsRef.current.quake
    if (!group) return
    group.clearLayers()
    if (!showEarthquakes) return
    for (const quake of earthquakes) {
      const selected = selection?.kind === 'quake' && selection.id === quake.id
      const magnitude = quake.magnitude ?? 0
      const marker = L.circleMarker([quake.latitude, quake.longitude], {
        radius: Math.max(4, 4 + magnitude * 1.8) + (selected ? 3 : 0),
        color: '#c07a4a',
        weight: selected ? 2 : 1,
        opacity: 0.95,
        fillColor: '#c07a4a',
        fillOpacity: 0.18,
        dashArray: '3 3',
      })
      marker.bindTooltip(tooltipElement(`M${magnitude.toFixed(1)} · ${quake.place}`, 'USGS seismic event'), {
        direction: 'top',
        offset: [0, -6],
        className: 'map-tooltip',
      })
      marker.on('click', () => handlersRef.current.onSelect({ kind: 'quake', id: quake.id }))
      marker.addTo(group)
    }
  }, [earthquakes, selection, showEarthquakes])

  useEffect(() => {
    const group = groupsRef.current.precip
    if (!group) return
    group.clearLayers()
    if (!showPrecipitation) return
    for (const point of precipitation) {
      if (point.precipitation_mm < 0.1) continue
      const intensity = Math.min(point.precipitation_mm, 24)
      const marker = L.circleMarker([point.latitude, point.longitude], {
        radius: 5 + Math.min(intensity, 18) * 0.42,
        color: '#5f8fa8',
        weight: 0.8,
        opacity: 0.7,
        fillColor: '#5f8fa8',
        fillOpacity: 0.16 + Math.min(intensity, 18) / 60,
      })
      marker.bindTooltip(
        tooltipElement(`${point.precipitation_mm.toFixed(1)} mm/h`, formatCoordinates(point.latitude, point.longitude)),
        { direction: 'top', offset: [0, -4], className: 'map-tooltip' },
      )
      marker.addTo(group)
    }
  }, [precipitation, showPrecipitation])

  useEffect(() => {
    const group = groupsRef.current.user
    if (!group) return
    group.clearLayers()
    if (!showUser || !userCoords) return
    const marker = L.marker([userCoords.latitude, userCoords.longitude], {
      icon: userMarker(),
      interactive: false,
      zIndexOffset: 900,
    })
    marker.addTo(group)
  }, [userCoords, showUser])

  useEffect(() => {
    const group = groupsRef.current.radius
    if (!group) return
    group.clearLayers()
    if (!showRadius || !userCoords) return
    L.circle([userCoords.latitude, userCoords.longitude], {
      radius: radiusKm * 1000,
      color: '#c8a061',
      weight: 1,
      opacity: 0.5,
      dashArray: '4 7',
      fillColor: '#c8a061',
      fillOpacity: 0.025,
      interactive: false,
    }).addTo(group)
  }, [userCoords, radiusKm, showRadius])

  useEffect(() => {
    const group = groupsRef.current.coverage
    if (!group) return
    group.clearLayers()
    if (!showCoverage) return
    for (const camera of cameras) {
      if (camera.status !== 'LIVE') continue
      L.circle([camera.latitude, camera.longitude], {
        radius: 450,
        color: '#6d9a7b',
        weight: 0.7,
        opacity: 0.35,
        fillColor: '#6d9a7b',
        fillOpacity: 0.05,
        interactive: false,
      }).addTo(group)
    }
  }, [cameras, showCoverage])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusTarget) return
    map.flyTo([focusTarget.latitude, focusTarget.longitude], focusTarget.zoom, { duration: 0.9 })
  }, [focusTarget])

  useEffect(() => {
    const map = mapRef.current
    if (!map || selection?.kind !== 'place') return
    map.flyTo([selection.center.latitude, selection.center.longitude], 7, { duration: 0.9 })
  }, [selection])

  const zoomIn = useCallback(() => mapRef.current?.zoomIn(1), [])
  const zoomOut = useCallback(() => mapRef.current?.zoomOut(1), [])
  const resetIndia = useCallback(() => {
    mapRef.current?.fitBounds(INDIA_LATLNG, { padding: [24, 24], animate: true })
  }, [])
  const toggleFullscreen = useCallback(() => {
    const target = containerRef.current?.closest('.map-stage') ?? containerRef.current
    if (!target) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void target.requestFullscreen?.()
  }, [])
  const locate = useCallback(() => {
    onLocate()
    if (userCoords) mapRef.current?.flyTo([userCoords.latitude, userCoords.longitude], 12, { duration: 0.9 })
  }, [onLocate, userCoords])

  return (
    <div className="map-stage">
      <div className="map-canvas" ref={containerRef} role="application" aria-label="India road intelligence map" />
      {boundaryError ? <div className="map-banner">{boundaryError}</div> : null}
      <div className="map-controls" aria-label="Map controls">
        <div className="control-group">
          <button type="button" className="map-btn" onClick={zoomIn} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="map-btn" onClick={zoomOut} aria-label="Zoom out">
            −
          </button>
        </div>
        <div className="control-group">
          <button type="button" className="map-btn" onClick={locate} aria-label="Go to my location">
            ◎
          </button>
          <button type="button" className="map-btn" onClick={resetIndia} aria-label="Reset India view">
            ⤢
          </button>
          <button type="button" className="map-btn" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
            ⛶
          </button>
        </div>
        <div className="control-group style-control">
          <button
            type="button"
            className="map-btn wide"
            onClick={() => setStyleMenu((value) => !value)}
            aria-expanded={styleMenu}
            aria-label="Map style"
          >
            {MAP_STYLES[mapStyle].label}
          </button>
          {styleMenu ? (
            <div className="style-menu" role="menu">
              {MAP_STYLE_ORDER.map((style) => (
                <button
                  key={style}
                  type="button"
                  role="menuitem"
                  className={style === mapStyle ? 'active' : ''}
                  onClick={() => {
                    onStyleChange(style)
                    setStyleMenu(false)
                  }}
                >
                  {MAP_STYLES[style].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="map-frame-caption">
        <span>India monitoring frame</span>
        <span className="mono">6.2°–35.9° N · 67.4°–97.9° E</span>
      </div>
    </div>
  )
}
