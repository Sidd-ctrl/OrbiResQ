export type CameraStatus = 'LIVE' | 'OFFLINE' | 'UNVERIFIED' | 'RESTRICTED' | 'ARCHIVED'
export type SourceType = 'hls' | 'http_video' | 'rtsp' | 'jpeg_snapshot' | 'web_page'
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type VerificationStatus = 'ai_detected' | 'verified' | 'false_positive' | 'resolved'

export interface Camera {
  id: string
  external_id: string
  name: string
  provider: string
  city: string | null
  district: string | null
  state: string | null
  country: string | null
  country_code: string | null
  latitude: number
  longitude: number
  source_type: string
  access_classification: string
  status: CameraStatus
  stream_url: string | null
  snapshot_url: string | null
  attribution: string | null
  usage_restrictions: string | null
  last_validated_at: string | null
  last_validation_note: string | null
  validation_latency_ms: number | null
  is_demo: boolean
  created_at: string
  updated_at: string
  distance_km: number | null
  incident_count: number
}

export interface StreamInfo {
  camera_id: string
  status: string
  playable: boolean
  playback_kind: 'hls' | 'video' | 'snapshot' | 'external_page' | 'unavailable'
  url: string | null
  attribution: string | null
  reason: string | null
}

export interface Incident {
  id: string
  category: string
  severity: Severity
  confidence: number | null
  detected_at: string
  camera_id: string | null
  camera_name: string | null
  latitude: number
  longitude: number
  city: string | null
  district: string | null
  state: string | null
  country: string | null
  evidence_image_url: string | null
  video_reference: string | null
  verification_status: VerificationStatus
  source: string
  description: string | null
  is_demo: boolean
  acknowledged_at: string | null
  created_at: string
}

export interface IncidentSummary {
  total: number
  last_24h: number
  by_severity: Record<string, number>
  by_category: Record<string, number>
  by_verification: Record<string, number>
  critical_open: number
}

export interface DatasetItem {
  id: string
  filename: string
  media_type: string
  size_bytes: number
  status: string
  item_metadata: Record<string, unknown>
  created_at: string
}

export interface Dataset {
  id: string
  name: string
  category: string
  description: string | null
  storage_backend: string
  storage_path: string | null
  size_bytes: number
  file_count: number
  processing_status: string
  dataset_metadata: Record<string, unknown>
  is_demo: boolean
  created_at: string
  items: DatasetItem[]
}

export interface ModelRecord {
  id: string
  name: string
  task: string
  framework: string
  version: string
  weights_path: string | null
  enabled: boolean
  config: Record<string, unknown>
  metrics: Record<string, unknown>
  created_at: string
}

export interface DetectorRuntime {
  id: string
  label: string
  task: string
  state: string
  detail: string
  requires: string[]
}

export interface NotificationRecord {
  id: string
  incident_id: string | null
  channel: string
  severity: string
  title: string
  body: string
  status: string
  error: string | null
  created_at: string
  acknowledged_at: string | null
}

export interface ChannelStatus {
  channel: string
  label: string
  configured: boolean
  required_environment: string[]
  detail: string
}

export interface HealthComponent {
  name: string
  status: 'ok' | 'degraded' | 'down' | 'not_configured'
  detail: string
}

export interface HealthResponse {
  status: string
  app: string
  version: string
  environment: string
  uptime_seconds: number
  database_backend: string
  components: HealthComponent[]
  counts: Record<string, number>
}

export interface ProviderInfo {
  id: string
  label: string
  description: string
  configured: boolean
  required_environment?: string[]
}

export interface SystemSettings {
  search_radius_options_km: number[]
  default_radius_km: number
  max_radius_km: number
  demo_data_enabled: boolean
  storage_backend: string
  providers: ProviderInfo[]
  emergency_services_enabled: boolean
}

export interface LocationInfo {
  latitude: number
  longitude: number
  locality: string | null
  city: string | null
  district: string | null
  state: string | null
  country: string | null
  country_code: string | null
  postcode: string | null
  display_name: string | null
  source: string
  resolved_at: string
  note: string | null
}

export interface LocationCandidate {
  display_name: string
  latitude: number
  longitude: number
  locality: string | null
  city: string | null
  district: string | null
  state: string | null
  country: string | null
}

export interface ProviderReport {
  id: string
  label: string
  status: 'ok' | 'error' | 'skipped' | 'not_configured'
  discovered: number
  detail: string | null
}

export interface DiscoveryResponse {
  latitude: number
  longitude: number
  radius_km: number
  providers: ProviderReport[]
  cameras: Camera[]
  total: number
  nearest: Camera[]
  message: string | null
}

export interface PaginatedCameras {
  items: Camera[]
  total: number
  page: number
  page_size: number
}

export interface PaginatedIncidents {
  items: Incident[]
  total: number
  page: number
  page_size: number
}

export interface EarthquakeEvent {
  id: string
  magnitude: number | null
  place: string
  latitude: number
  longitude: number
  depth_km: number | null
  occurred_at: string
  url: string | null
}

export interface PrecipitationPoint {
  latitude: number
  longitude: number
  precipitation_mm: number
  rain_mm: number
  weather_code: number | null
  observed_at: string | null
}

export interface EnvironmentSource {
  id: string
  label: string
  attribution: string
  status: 'live' | 'unavailable'
  detail: string
  count: number
}

export interface EnvironmentLayers {
  generated_at: string
  bounds: { min_lat: number; max_lat: number; min_lon: number; max_lon: number }
  sources: EnvironmentSource[]
  earthquakes: EarthquakeEvent[]
  precipitation: PrecipitationPoint[]
}

export interface PaginatedNotifications {
  items: NotificationRecord[]
  total: number
  page: number
  page_size: number
}
