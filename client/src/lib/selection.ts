import type { LatLon } from './geo'

export type Selection =
  | { kind: 'camera'; id: string }
  | { kind: 'incident'; id: string }
  | { kind: 'quake'; id: string }
  | { kind: 'place'; id: string; name: string; center: LatLon; state?: string | null }
  | { kind: 'location' }

export interface FocusTarget {
  latitude: number
  longitude: number
  zoom: number
  nonce: number
}
