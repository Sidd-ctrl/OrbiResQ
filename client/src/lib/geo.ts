export interface LatLon {
  latitude: number
  longitude: number
}

export const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [6.2, 67.4],
  [35.9, 97.9],
]

export const INDIA_CENTER: [number, number] = [22.6, 80.4]

const EARTH_RADIUS_KM = 6371
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const toRad = (value: number) => (value * Math.PI) / 180
const pad = (value: number) => String(value).padStart(2, '0')

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function inIndia(latitude: number, longitude: number): boolean {
  return latitude >= 6.0 && latitude <= 36.2 && longitude >= 67.0 && longitude <= 98.2
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

export function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`
  return `${lat}  ${lon}`
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} · ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

export function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatDay(date: Date): string {
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const deltaSeconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (deltaSeconds < 60) return 'just now'
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)} min ago`
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)} h ago`
  if (deltaSeconds < 604800) return `${Math.floor(deltaSeconds / 86400)} d ago`
  return formatTimestamp(iso)
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
