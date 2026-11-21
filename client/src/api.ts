import type {
  Camera,
  ChannelStatus,
  Dataset,
  DetectorRuntime,
  DiscoveryResponse,
  HealthResponse,
  Incident,
  IncidentSummary,
  LocationCandidate,
  LocationInfo,
  ModelRecord,
  NotificationRecord,
  PaginatedCameras,
  PaginatedIncidents,
  PaginatedNotifications,
  StreamInfo,
  SystemSettings,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const payload = await response.json()
      if (typeof payload.detail === 'string') detail = payload.detail
      else if (payload.detail) detail = JSON.stringify(payload.detail)
    } catch {
      /* keep status text */
    }
    throw new ApiError(detail, response.status)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const suffix = search.toString()
  return suffix ? `?${suffix}` : ''
}

export const api = {
  location: (lat: number, lon: number) =>
    request<LocationInfo>(`/api/location/current${query({ latitude: lat, longitude: lon })}`),
  searchLocations: (q: string) => request<LocationCandidate[]>(`/api/location/search${query({ q })}`),

  discover: (body: { latitude: number; longitude: number; radius_km: number; providers?: string[]; persist?: boolean }) =>
    request<DiscoveryResponse>('/api/cameras/discover', { method: 'POST', body: JSON.stringify(body) }),
  cameras: (params: {
    latitude?: number
    longitude?: number
    radius_km?: number
    status?: string
    provider?: string
    city?: string
    search?: string
    page?: number
    page_size?: number
  }) => request<PaginatedCameras>(`/api/cameras${query(params)}`),
  camera: (id: string) => request<Camera>(`/api/cameras/${id}`),
  validateCamera: (id: string) => request<Camera>(`/api/cameras/${id}/validate`, { method: 'POST' }),
  stream: (id: string) => request<StreamInfo>(`/api/cameras/${id}/stream`),
  registerCamera: (body: Record<string, unknown>) =>
    request<Camera>('/api/cameras', { method: 'POST', body: JSON.stringify(body) }),
  radiusOptions: () => request<{ options_km: number[]; default_km: number }>('/api/cameras/radius-options'),

  incidents: (params: Record<string, string | number | undefined>) =>
    request<PaginatedIncidents>(`/api/incidents${query(params)}`),
  incident: (id: string) => request<Incident>(`/api/incidents/${id}`),
  incidentSummary: () => request<IncidentSummary>('/api/incidents/summary'),
  incidentCategories: () => request<{ categories: string[] }>('/api/incidents/categories'),
  updateIncident: (id: string, body: Record<string, unknown>) =>
    request<Incident>(`/api/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  datasets: () => request<Dataset[]>('/api/datasets'),
  createDataset: (body: { name: string; category: string; description?: string }) =>
    request<Dataset>('/api/datasets', { method: 'POST', body: JSON.stringify(body) }),
  importFiles: (form: FormData) => request<Dataset>('/api/datasets/import', { method: 'POST', body: form }),
  deleteDataset: (id: string) => request<void>(`/api/datasets/${id}`, { method: 'DELETE' }),

  models: () => request<ModelRecord[]>('/api/models'),
  runtimeModels: () => request<{ reachable: boolean; detail?: string; detectors: DetectorRuntime[] }>('/api/models/runtime'),

  health: () => request<HealthResponse>('/api/system/health'),
  settings: () => request<SystemSettings>('/api/system/settings'),
  updateSettings: (body: Record<string, unknown>) =>
    request<SystemSettings>('/api/system/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  storage: () =>
    request<{ backend: string; available: boolean; detail: string; path: string | null; public_url: boolean }>(
      '/api/system/storage',
    ),

  channels: () => request<ChannelStatus[]>('/api/notifications/channels'),
  notifications: (params: { page?: number; page_size?: number; unacknowledged_only?: boolean } = {}) =>
    request<PaginatedNotifications>(`/api/notifications${query(params)}`),
  acknowledge: (id: string) => request<NotificationRecord>(`/api/notifications/${id}/acknowledge`, { method: 'POST' }),
  testAlert: () => request<NotificationRecord>('/api/notifications/test', { method: 'POST' }),
}
