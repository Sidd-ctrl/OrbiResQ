import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from './api'
import { haversineKm } from './lib/geo'
import { LAYERS, defaultLayerState, type LayerGroupId } from './lib/layers'
import type { FocusTarget, Selection } from './lib/selection'
import { usePlatform } from './state'
import type {
  Camera,
  EarthquakeEvent,
  EnvironmentSource,
  HealthResponse,
  Incident,
  IncidentSummary,
  NotificationRecord,
  PrecipitationPoint,
  ProviderReport,
} from './types'

const LAYER_KEY = 'orbi-resq-layers'

interface IntelValue {
  cameras: Camera[]
  incidents: Incident[]
  earthquakes: EarthquakeEvent[]
  precipitation: PrecipitationPoint[]
  environmentSources: EnvironmentSource[]
  environmentError: string | null
  summary: IncidentSummary | null
  health: HealthResponse | null
  notifications: NotificationRecord[]
  unacknowledged: number
  loading: boolean
  error: string | null
  updatedAt: string | null
  refresh: () => Promise<void>
  acknowledge: (id: string) => Promise<void>
  layerState: Record<string, boolean>
  toggleLayer: (id: string) => void
  setGroupEnabled: (group: LayerGroupId, enabled: boolean) => void
  resetLayers: () => void
  counts: Record<string, number>
  visibleCameras: Camera[]
  visibleIncidents: Incident[]
  selection: Selection | null
  select: (selection: Selection | null) => void
  focusTarget: FocusTarget | null
  focusOn: (latitude: number, longitude: number, zoom?: number) => void
  discovering: boolean
  discoveryMessage: string | null
  discoveryReports: ProviderReport[]
  discover: () => Promise<void>
  selectedCamera: Camera | null
  selectedIncident: Incident | null
  selectedQuake: EarthquakeEvent | null
  nearbyCameras: Camera[]
}

const IntelContext = createContext<IntelValue | null>(null)

function readLayers(): Record<string, boolean> {
  const base = defaultLayerState()
  try {
    const raw = localStorage.getItem(LAYER_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Record<string, boolean>
    for (const layer of LAYERS) {
      if (typeof parsed[layer.id] === 'boolean' && !layer.unavailable) base[layer.id] = parsed[layer.id]
    }
  } catch {
    return base
  }
  return base
}

function persistLayers(state: Record<string, boolean>) {
  try {
    localStorage.setItem(LAYER_KEY, JSON.stringify(state))
  } catch {
    return
  }
}

export function IntelProvider({ children }: { children: ReactNode }) {
  const { coords, radiusKm } = usePlatform()
  const [cameras, setCameras] = useState<Camera[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [earthquakes, setEarthquakes] = useState<EarthquakeEvent[]>([])
  const [precipitation, setPrecipitation] = useState<PrecipitationPoint[]>([])
  const [environmentSources, setEnvironmentSources] = useState<EnvironmentSource[]>([])
  const [environmentError, setEnvironmentError] = useState<string | null>(null)
  const [summary, setSummary] = useState<IncidentSummary | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [layerState, setLayerState] = useState<Record<string, boolean>>(readLayers)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null)
  const [discoveryReports, setDiscoveryReports] = useState<ProviderReport[]>([])
  const nonceRef = useRef(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      api.cameras({ page_size: 500 }),
      api.incidents({ page_size: 200 }),
      api.incidentSummary(),
      api.environment(),
    ])
    const failures: string[] = []

    const cameraResult = results[0]
    if (cameraResult.status === 'fulfilled') setCameras(cameraResult.value.items)
    else failures.push('camera registry')

    const incidentResult = results[1]
    if (incidentResult.status === 'fulfilled') setIncidents(incidentResult.value.items)
    else failures.push('incident records')

    const summaryResult = results[2]
    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value)
    else failures.push('incident summary')

    const environmentResult = results[3]
    if (environmentResult.status === 'fulfilled') {
      setEarthquakes(environmentResult.value.earthquakes)
      setPrecipitation(environmentResult.value.precipitation)
      setEnvironmentSources(environmentResult.value.sources)
      setEnvironmentError(null)
    } else {
      setEnvironmentError((environmentResult.reason as Error).message)
      setEnvironmentSources([])
    }

    setError(failures.length ? `Unavailable right now: ${failures.join(', ')}.` : null)
    setUpdatedAt(new Date().toISOString())
    setLoading(false)
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      const result = await api.notifications({ page_size: 20 })
      setNotifications(result.items)
    } catch {
      setNotifications([])
    }
  }, [])

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await api.health())
    } catch {
      setHealth(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 120000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    void loadHealth()
    void loadNotifications()
    const timer = window.setInterval(() => {
      void loadHealth()
      void loadNotifications()
    }, 60000)
    return () => window.clearInterval(timer)
  }, [loadHealth, loadNotifications])

  const acknowledge = useCallback(
    async (id: string) => {
      try {
        const updated = await api.acknowledge(id)
        setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      } catch {
        return
      }
    },
    [],
  )

  const toggleLayer = useCallback((id: string) => {
    setLayerState((current) => {
      const next = { ...current, [id]: !current[id] }
      persistLayers(next)
      return next
    })
  }, [])

  const setGroupEnabled = useCallback((group: LayerGroupId, enabled: boolean) => {
    setLayerState((current) => {
      const next = { ...current }
      for (const layer of LAYERS) {
        if (layer.group === group && !layer.unavailable) next[layer.id] = enabled
      }
      persistLayers(next)
      return next
    })
  }, [])

  const resetLayers = useCallback(() => {
    const next = defaultLayerState()
    persistLayers(next)
    setLayerState(next)
  }, [])

  const select = useCallback(
    (next: Selection | null) => {
      setSelection(next)
      if (!next) return
      const zoomFor = (kind: string) => (kind === 'quake' ? 6 : kind === 'place' ? 8 : 11)
      if (next.kind === 'camera') {
        const camera = cameras.find((item) => item.id === next.id)
        if (camera) {
          nonceRef.current += 1
          setFocusTarget({
            latitude: camera.latitude,
            longitude: camera.longitude,
            zoom: Math.max(zoomFor(next.kind), 9),
            nonce: nonceRef.current,
          })
        }
      } else if (next.kind === 'incident') {
        const incident = incidents.find((item) => item.id === next.id)
        if (incident) {
          nonceRef.current += 1
          setFocusTarget({
            latitude: incident.latitude,
            longitude: incident.longitude,
            zoom: Math.max(zoomFor(next.kind), 9),
            nonce: nonceRef.current,
          })
        }
      } else if (next.kind === 'quake') {
        const quake = earthquakes.find((item) => item.id === next.id)
        if (quake) {
          nonceRef.current += 1
          setFocusTarget({
            latitude: quake.latitude,
            longitude: quake.longitude,
            zoom: zoomFor(next.kind),
            nonce: nonceRef.current,
          })
        }
      }
    },
    [cameras, incidents, earthquakes],
  )

  const focusOn = useCallback((latitude: number, longitude: number, zoom = 11) => {
    nonceRef.current += 1
    setFocusTarget({ latitude, longitude, zoom, nonce: nonceRef.current })
  }, [])

  const discover = useCallback(async () => {
    if (!coords) {
      setDiscoveryMessage('Set a location before running discovery.')
      return
    }
    setDiscovering(true)
    setDiscoveryMessage(null)
    try {
      const result = await api.discover({
        latitude: coords.latitude,
        longitude: coords.longitude,
        radius_km: radiusKm,
        persist: true,
      })
      setDiscoveryReports(result.providers)
      setDiscoveryMessage(
        result.total > 0
          ? `${result.total} source${result.total === 1 ? '' : 's'} returned within ${radiusKm} km.`
          : result.message ?? `No accessible live camera feeds found within ${radiusKm} km.`,
      )
      await refresh()
    } catch (caught) {
      setDiscoveryMessage((caught as Error).message)
    } finally {
      setDiscovering(false)
    }
  }, [coords, radiusKm, refresh])

  const enrichedCameras = useMemo(
    () =>
      cameras.map((camera) =>
        coords
          ? { ...camera, distance_km: haversineKm(coords, { latitude: camera.latitude, longitude: camera.longitude }) }
          : camera,
      ),
    [cameras, coords],
  )

  const nearbyCameras = useMemo(() => {
    if (!coords) return []
    return enrichedCameras
      .filter((camera) => (camera.distance_km ?? Number.POSITIVE_INFINITY) <= radiusKm)
      .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
  }, [enrichedCameras, coords, radiusKm])

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const layer of LAYERS) {
      if (layer.unavailable) {
        result[layer.id] = 0
        continue
      }
      if (layer.id === 'nearby_cameras') result[layer.id] = nearbyCameras.length
      else if (layer.kind === 'camera') result[layer.id] = enrichedCameras.filter(layer.cameraFilter ?? (() => false)).length
      else if (layer.kind === 'incident')
        result[layer.id] = incidents.filter(layer.incidentFilter ?? (() => false)).length
      else if (layer.kind === 'quake') result[layer.id] = earthquakes.length
      else if (layer.kind === 'precip') result[layer.id] = precipitation.length
      else if (layer.kind === 'states') result[layer.id] = 34
      else if (layer.kind === 'user') result[layer.id] = coords ? 1 : 0
      else if (layer.kind === 'radius') result[layer.id] = coords ? 1 : 0
      else if (layer.kind === 'coverage')
        result[layer.id] = enrichedCameras.filter((camera) => camera.status === 'LIVE').length
      else result[layer.id] = 0
    }
    return result
  }, [enrichedCameras, incidents, earthquakes, precipitation, coords, nearbyCameras])

  const visibleCameras = useMemo(() => {
    const active = LAYERS.filter((layer) => layer.kind === 'camera' && layerState[layer.id] && !layer.unavailable)
    if (!active.length) return []
    const union = new Map<string, Camera>()
    for (const layer of active) {
      const pool =
        layer.id === 'nearby_cameras' ? nearbyCameras : enrichedCameras.filter(layer.cameraFilter ?? (() => false))
      for (const camera of pool) union.set(camera.id, camera)
    }
    return [...union.values()]
  }, [layerState, enrichedCameras, nearbyCameras])

  const visibleIncidents = useMemo(() => {
    const active = LAYERS.filter((layer) => layer.kind === 'incident' && layerState[layer.id] && !layer.unavailable)
    if (!active.length) return []
    const union = new Map<string, Incident>()
    for (const layer of active) {
      for (const incident of incidents.filter(layer.incidentFilter ?? (() => false))) union.set(incident.id, incident)
    }
    return [...union.values()]
  }, [layerState, incidents])

  const selectedCamera = useMemo(
    () => (selection?.kind === 'camera' ? cameras.find((item) => item.id === selection.id) ?? null : null),
    [selection, cameras],
  )
  const selectedIncident = useMemo(
    () => (selection?.kind === 'incident' ? incidents.find((item) => item.id === selection.id) ?? null : null),
    [selection, incidents],
  )
  const selectedQuake = useMemo(
    () => (selection?.kind === 'quake' ? earthquakes.find((item) => item.id === selection.id) ?? null : null),
    [selection, earthquakes],
  )

  const unacknowledged = useMemo(
    () => notifications.filter((item) => !item.acknowledged_at).length,
    [notifications],
  )

  const value = useMemo<IntelValue>(
    () => ({
      cameras: enrichedCameras,
      incidents,
      earthquakes,
      precipitation,
      environmentSources,
      environmentError,
      summary,
      health,
      notifications,
      unacknowledged,
      loading,
      error,
      updatedAt,
      refresh,
      acknowledge,
      layerState,
      toggleLayer,
      setGroupEnabled,
      resetLayers,
      counts,
      visibleCameras,
      visibleIncidents,
      selection,
      select,
      focusTarget,
      focusOn,
      discovering,
      discoveryMessage,
      discoveryReports,
      discover,
      selectedCamera,
      selectedIncident,
      selectedQuake,
      nearbyCameras,
    }),
    [
      enrichedCameras,
      incidents,
      earthquakes,
      precipitation,
      environmentSources,
      environmentError,
      summary,
      health,
      notifications,
      unacknowledged,
      loading,
      error,
      updatedAt,
      refresh,
      acknowledge,
      layerState,
      toggleLayer,
      setGroupEnabled,
      resetLayers,
      counts,
      visibleCameras,
      visibleIncidents,
      selection,
      select,
      focusTarget,
      focusOn,
      discovering,
      discoveryMessage,
      discoveryReports,
      discover,
      selectedCamera,
      selectedIncident,
      selectedQuake,
      nearbyCameras,
    ],
  )

  return <IntelContext.Provider value={value}>{children}</IntelContext.Provider>
}

export function useIntel(): IntelValue {
  const context = useContext(IntelContext)
  if (!context) throw new Error('useIntel must be used inside IntelProvider')
  return context
}
