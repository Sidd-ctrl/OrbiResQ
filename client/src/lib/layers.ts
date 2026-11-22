import type { Camera, Incident } from '../types'

export type LayerGroupId = 'road' | 'environment' | 'location' | 'additional'

export type LayerKind =
  | 'camera'
  | 'incident'
  | 'quake'
  | 'precip'
  | 'states'
  | 'user'
  | 'radius'
  | 'coverage'
  | 'none'

export interface LayerDef {
  id: string
  group: LayerGroupId
  label: string
  kind: LayerKind
  detail: string
  source: string
  defaultOn: boolean
  unavailable?: string
  categories?: string[]
  cameraFilter?: (camera: Camera) => boolean
  incidentFilter?: (incident: Incident) => boolean
}

export const LAYER_GROUPS: { id: LayerGroupId; label: string; note: string }[] = [
  { id: 'road', label: 'Road intelligence', note: 'Registry, discovery adapters and incident records' },
  { id: 'environment', label: 'Environmental intelligence', note: 'Seismic, hydrological and fire observations' },
  { id: 'location', label: 'Location intelligence', note: 'Position, coverage and administrative geometry' },
  { id: 'additional', label: 'Additional information', note: 'History, coverage zones and licensed feeds' },
]

const normalize = (value: string) => value.toLowerCase().replace(/[\s-]+/g, '_')

const inCategories = (categories: string[]) => (incident: Incident) =>
  categories.includes(normalize(incident.category))

const RECENT_WINDOW_MS = 7 * 24 * 3600 * 1000

export const LAYERS: LayerDef[] = [
  {
    id: 'cctv_live',
    group: 'road',
    label: 'Live CCTV cameras',
    kind: 'camera',
    detail: 'Validated feeds that answered the last connection test',
    source: 'ORBI RESQ camera registry',
    defaultOn: true,
    cameraFilter: (camera) => camera.status === 'LIVE',
  },
  {
    id: 'cctv_public',
    group: 'road',
    label: 'Public traffic cameras',
    kind: 'camera',
    detail: 'Registered public sources that are not currently validated as live',
    source: 'Registry · discovery adapters',
    defaultOn: true,
    cameraFilter: (camera) => camera.access_classification === 'public' && camera.status !== 'LIVE',
  },
  {
    id: 'rtsp_authorized',
    group: 'road',
    label: 'Authorized RTSP sources',
    kind: 'camera',
    detail: 'Operator-registered streams with explicit authorization',
    source: 'Private registry',
    defaultOn: true,
    cameraFilter: (camera) => camera.source_type === 'rtsp',
  },
  {
    id: 'incident_accident',
    group: 'road',
    label: 'Road accidents',
    kind: 'incident',
    detail: 'Accident records awaiting or holding verification',
    source: 'Detection pipeline · field reports',
    defaultOn: true,
    categories: ['accident', 'collision'],
    incidentFilter: inCategories(['accident', 'collision']),
  },
  {
    id: 'incident_collision',
    group: 'road',
    label: 'Vehicle collisions',
    kind: 'incident',
    detail: 'Multi-vehicle collision records',
    source: 'Detection pipeline · field reports',
    defaultOn: true,
    categories: ['collision'],
    incidentFilter: inCategories(['collision']),
  },
  {
    id: 'incident_pothole',
    group: 'road',
    label: 'Potholes',
    kind: 'incident',
    detail: 'Surface defects logged against a road segment',
    source: 'Detection pipeline · field reports',
    defaultOn: true,
    categories: ['pothole'],
    incidentFilter: inCategories(['pothole']),
  },
  {
    id: 'incident_obstruction',
    group: 'road',
    label: 'Road obstructions',
    kind: 'incident',
    detail: 'Blocked carriageway, debris and fallen trees',
    source: 'Detection pipeline · field reports',
    defaultOn: true,
    categories: ['road_obstruction', 'fallen_tree', 'debris'],
    incidentFilter: inCategories(['road_obstruction', 'fallen_tree', 'debris']),
  },
  {
    id: 'incident_congestion',
    group: 'road',
    label: 'Traffic congestion',
    kind: 'incident',
    detail: 'Abnormal traffic behaviour and density anomalies',
    source: 'Traffic analysis',
    defaultOn: true,
    categories: ['traffic_anomaly', 'congestion', 'traffic'],
    incidentFilter: inCategories(['traffic_anomaly', 'congestion', 'traffic']),
  },
  {
    id: 'incident_debris',
    group: 'road',
    label: 'Debris',
    kind: 'incident',
    detail: 'Loose material reported on the carriageway',
    source: 'Detection pipeline · field reports',
    defaultOn: false,
    categories: ['debris'],
    incidentFilter: inCategories(['debris']),
  },
  {
    id: 'flood',
    group: 'environment',
    label: 'Flood alerts',
    kind: 'incident',
    detail: 'Inundation records on monitored road segments',
    source: 'Detection pipeline',
    defaultOn: true,
    categories: ['flood'],
    incidentFilter: inCategories(['flood']),
  },
  {
    id: 'waterlogging',
    group: 'environment',
    label: 'Waterlogging',
    kind: 'incident',
    detail: 'Standing water affecting traffic flow',
    source: 'Detection pipeline',
    defaultOn: true,
    categories: ['waterlogging'],
    incidentFilter: inCategories(['waterlogging']),
  },
  {
    id: 'rainfall',
    group: 'environment',
    label: 'Heavy rainfall',
    kind: 'precip',
    detail: 'Live precipitation sample grid over India',
    source: 'Open-Meteo forecast API',
    defaultOn: true,
  },
  {
    id: 'earthquakes',
    group: 'environment',
    label: 'Earthquakes',
    kind: 'quake',
    detail: 'Seismic events M2.5+ in the last 24 hours',
    source: 'USGS earthquake feed',
    defaultOn: true,
  },
  {
    id: 'landslide',
    group: 'environment',
    label: 'Landslide alerts',
    kind: 'incident',
    detail: 'Slope failures and landslide indicators',
    source: 'Detection pipeline',
    defaultOn: true,
    categories: ['landslide'],
    incidentFilter: inCategories(['landslide']),
  },
  {
    id: 'fire_smoke',
    group: 'environment',
    label: 'Fire and smoke',
    kind: 'incident',
    detail: 'Combustion and smoke observations',
    source: 'Detection pipeline',
    defaultOn: true,
    categories: ['fire', 'smoke'],
    incidentFilter: inCategories(['fire', 'smoke']),
  },
  {
    id: 'weather_warnings',
    group: 'environment',
    label: 'Extreme weather warnings',
    kind: 'none',
    detail: 'Official warning bulletins by district',
    source: 'IMD bulletin feed',
    defaultOn: false,
    unavailable: 'No licensed warning bulletin feed is configured',
  },
  {
    id: 'my_location',
    group: 'location',
    label: 'My current location',
    kind: 'user',
    detail: 'Device position used for distance and coverage',
    source: 'Device geolocation',
    defaultOn: true,
  },
  {
    id: 'nearby_cameras',
    group: 'location',
    label: 'Nearby monitoring cameras',
    kind: 'camera',
    detail: 'Registered sources inside the selected search radius',
    source: 'ORBI RESQ camera registry',
    defaultOn: true,
  },
  {
    id: 'monitoring_zones',
    group: 'location',
    label: 'Registered monitoring zone',
    kind: 'radius',
    detail: 'Active discovery radius around your position',
    source: 'Discovery configuration',
    defaultOn: true,
  },
  {
    id: 'state_boundaries',
    group: 'location',
    label: 'State boundaries',
    kind: 'states',
    detail: 'State and union territory outlines',
    source: 'India boundary dataset',
    defaultOn: true,
  },
  {
    id: 'district_boundaries',
    group: 'location',
    label: 'District boundaries',
    kind: 'none',
    detail: 'District-level administrative outlines',
    source: 'Not bundled',
    defaultOn: false,
    unavailable: 'District geometry is not bundled with this deployment',
  },
  {
    id: 'city_boundaries',
    group: 'location',
    label: 'City boundaries',
    kind: 'none',
    detail: 'Urban local body outlines',
    source: 'Not bundled',
    defaultOn: false,
    unavailable: 'City boundary geometry is not bundled with this deployment',
  },
  {
    id: 'historical_incidents',
    group: 'additional',
    label: 'Historical incident locations',
    kind: 'incident',
    detail: 'Records older than seven days',
    source: 'Incident archive',
    defaultOn: false,
    incidentFilter: (incident) => Date.now() - new Date(incident.detected_at).getTime() > RECENT_WINDOW_MS,
  },
  {
    id: 'coverage_zones',
    group: 'additional',
    label: 'Camera coverage zones',
    kind: 'coverage',
    detail: 'Approximate field of view for validated feeds',
    source: 'Registry geometry',
    defaultOn: false,
  },
  {
    id: 'archived_footage',
    group: 'additional',
    label: 'Archived footage',
    kind: 'none',
    detail: 'Retained clips referenced by incidents',
    source: 'Storage backend',
    defaultOn: false,
    unavailable: 'No archived footage store is configured',
  },
  {
    id: 'road_safety_news',
    group: 'additional',
    label: 'Road safety news',
    kind: 'none',
    detail: 'Recent licensed news relevant to road safety',
    source: 'Not configured',
    defaultOn: false,
    unavailable: 'No licensed news provider is configured',
  },
]

export function defaultLayerState(): Record<string, boolean> {
  const state: Record<string, boolean> = {}
  for (const layer of LAYERS) state[layer.id] = Boolean(layer.defaultOn) && !layer.unavailable
  return state
}

export function layersInGroup(group: LayerGroupId): LayerDef[] {
  return LAYERS.filter((layer) => layer.group === group)
}

export function dataLayers(): LayerDef[] {
  return LAYERS.filter((layer) => layer.kind !== 'none')
}

export function layerById(id: string): LayerDef | undefined {
  return LAYERS.find((layer) => layer.id === id)
}
