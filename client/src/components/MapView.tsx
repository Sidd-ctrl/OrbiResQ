import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import type { Camera, Incident } from '../types'

interface Props {
  center: { latitude: number; longitude: number }
  cameras?: Camera[]
  incidents?: Incident[]
  radiusKm?: number
  height?: number
  zoom?: number
  selectedCameraId?: string | null
  onSelectCamera?: (camera: Camera) => void
  onSelectIncident?: (incident: Incident) => void
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

function cameraIcon(status: string) {
  return L.divIcon({
    className: '',
    html: `<div class="cam-marker ${status.toLowerCase()}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function incidentIcon(severity: string) {
  return L.divIcon({
    className: '',
    html: `<div class="incident-marker ${severity.toLowerCase()}"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

export default function MapView({
  center,
  cameras = [],
  incidents = [],
  radiusKm,
  height = 340,
  zoom = 12,
  selectedCameraId = null,
  onSelectCamera,
  onSelectIncident,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const cameraLayer = useRef<L.LayerGroup | null>(null)
  const incidentLayer = useRef<L.LayerGroup | null>(null)
  const radiusLayer = useRef<L.LayerGroup | null>(null)
  const userMarker = useRef<L.Marker | null>(null)
  const [tilesFailed, setTilesFailed] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      center: [center.latitude, center.longitude],
      zoom,
    })
    const tiles = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    })
    tiles.on('tileerror', () => setTilesFailed(true))
    tiles.addTo(map)
    cameraLayer.current = L.layerGroup().addTo(map)
    incidentLayer.current = L.layerGroup().addTo(map)
    radiusLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 120)
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setView([center.latitude, center.longitude], map.getZoom(), { animate: true })
    if (!userMarker.current) {
      userMarker.current = L.marker([center.latitude, center.longitude], {
        icon: L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        keyboard: false,
        interactive: false,
        zIndexOffset: 800,
      }).addTo(map)
    } else {
      userMarker.current.setLatLng([center.latitude, center.longitude])
    }
  }, [center.latitude, center.longitude])

  useEffect(() => {
    const layer = radiusLayer.current
    if (!layer) return
    layer.clearLayers()
    if (!radiusKm) return
    L.circle([center.latitude, center.longitude], {
      radius: radiusKm * 1000,
      color: '#0f4c81',
      weight: 1,
      opacity: 0.5,
      fillColor: '#0f4c81',
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(layer)
  }, [center.latitude, center.longitude, radiusKm])

  useEffect(() => {
    const layer = cameraLayer.current
    if (!layer) return
    layer.clearLayers()
    cameras.forEach((camera) => {
      const marker = L.marker([camera.latitude, camera.longitude], {
        icon: cameraIcon(camera.status),
        title: camera.name,
        zIndexOffset: camera.id === selectedCameraId ? 600 : 0,
      })
      const distance = camera.distance_km != null ? `<br/>${camera.distance_km.toFixed(1)} km away` : ''
      marker.bindPopup(
        `<strong>${escapeHtml(camera.name)}</strong><br/>${escapeHtml(camera.provider)} · ${camera.status}${distance}`,
      )
      marker.on('click', () => onSelectCamera?.(camera))
      marker.addTo(layer)
    })
  }, [cameras, selectedCameraId, onSelectCamera])

  useEffect(() => {
    const layer = incidentLayer.current
    if (!layer) return
    layer.clearLayers()
    incidents.forEach((incident) => {
      const marker = L.marker([incident.latitude, incident.longitude], {
        icon: incidentIcon(incident.severity),
        title: `${incident.category} · ${incident.severity}`,
      })
      marker.bindPopup(
        `<strong>${escapeHtml(incident.category)}</strong><br/>${incident.severity} · ${new Date(incident.detected_at).toLocaleString()}`,
      )
      marker.on('click', () => onSelectIncident?.(incident))
      marker.addTo(layer)
    })
  }, [incidents, onSelectIncident])

  return (
    <div className="map-shell" style={{ height }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <div className="map-legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#1a7a53' }} /> Live camera
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#b07816' }} /> Unverified
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#a12a1f' }} /> Offline / incident
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: '#0f4c81' }} /> Your location
        </span>
      </div>
      {tilesFailed ? (
        <div className="feed-note" style={{ position: 'absolute', top: 0, bottom: 'auto' }}>
          Map tiles could not be loaded from OpenStreetMap. Markers and distances are still accurate.
        </div>
      ) : null}
    </div>
  )
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[char]
  })
}
