import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { LocationInfo } from './types'

const STORAGE_KEY = 'orbi-resq-location'
const RADIUS_KEY = 'orbi-resq-radius'

export type LocateState = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'error'

interface Coordinates {
  latitude: number
  longitude: number
}

interface PlatformContextValue {
  coords: Coordinates | null
  place: LocationInfo | null
  placeLoading: boolean
  placeError: string | null
  radiusKm: number
  setRadiusKm: (value: number) => void
  radiusOptions: number[]
  locateState: LocateState
  locateMessage: string | null
  requestLocation: () => void
  useCoordinates: (latitude: number, longitude: number) => void
  refreshPlace: () => void
}

const PlatformContext = createContext<PlatformContextValue | null>(null)

function readStoredCoords(): Coordinates | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Coordinates
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') return parsed
  } catch {
    /* ignore malformed storage */
  }
  return null
}

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [coords, setCoords] = useState<Coordinates | null>(readStoredCoords)
  const [place, setPlace] = useState<LocationInfo | null>(null)
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [locateState, setLocateState] = useState<LocateState>(coords ? 'ready' : 'idle')
  const [locateMessage, setLocateMessage] = useState<string | null>(null)
  const [radiusKm, setRadiusState] = useState<number>(() => {
    const stored = Number(localStorage.getItem(RADIUS_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : 25
  })
  const [radiusOptions, setRadiusOptions] = useState<number[]>([5, 10, 25, 50, 100])
  const [placeNonce, setPlaceNonce] = useState(0)

  useEffect(() => {
    api
      .radiusOptions()
      .then((result) => setRadiusOptions(result.options_km))
      .catch(() => setRadiusOptions([5, 10, 25, 50, 100]))
  }, [])

  useEffect(() => {
    if (!coords) return
    let cancelled = false
    setPlaceLoading(true)
    setPlaceError(null)
    api
      .location(coords.latitude, coords.longitude)
      .then((result) => {
        if (!cancelled) setPlace(result)
      })
      .catch((error: Error) => {
        if (!cancelled) setPlaceError(error.message)
      })
      .finally(() => {
        if (!cancelled) setPlaceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [coords, placeNonce])

  const useCoordinates = useCallback((latitude: number, longitude: number) => {
    const next = { latitude, longitude }
    setCoords(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setLocateState('ready')
    setLocateMessage('Location set manually.')
  }, [])

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocateState('unavailable')
      setLocateMessage('This browser does not expose a location API. Set your location manually.')
      return
    }
    setLocateState('locating')
    setLocateMessage('Requesting device location…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        useCoordinates(position.coords.latitude, position.coords.longitude)
        setLocateMessage(`Device location acquired (±${Math.round(position.coords.accuracy)} m).`)
      },
      (error) => {
        setLocateState(error.code === error.PERMISSION_DENIED ? 'denied' : 'error')
        setLocateMessage(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Search for a city or enter coordinates.'
            : `Device location unavailable: ${error.message}`,
        )
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }, [useCoordinates])

  useEffect(() => {
    if (!readStoredCoords()) requestLocation()
  }, [requestLocation])

  const setRadiusKm = useCallback((value: number) => {
    setRadiusState(value)
    localStorage.setItem(RADIUS_KEY, String(value))
  }, [])

  const refreshPlace = useCallback(() => setPlaceNonce((value) => value + 1), [])

  const value = useMemo<PlatformContextValue>(
    () => ({
      coords,
      place,
      placeLoading,
      placeError,
      radiusKm,
      setRadiusKm,
      radiusOptions,
      locateState,
      locateMessage,
      requestLocation,
      useCoordinates,
      refreshPlace,
    }),
    [
      coords,
      place,
      placeLoading,
      placeError,
      radiusKm,
      setRadiusKm,
      radiusOptions,
      locateState,
      locateMessage,
      requestLocation,
      useCoordinates,
      refreshPlace,
    ],
  )

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatform(): PlatformContextValue {
  const context = useContext(PlatformContext)
  if (!context) throw new Error('usePlatform must be used inside PlatformProvider')
  return context
}

export function placeLabel(place: LocationInfo | null): string {
  if (!place) return 'Location not set'
  const parts = [place.locality, place.city, place.district, place.state, place.country].filter(
    (part): part is string => Boolean(part),
  )
  return parts.length ? Array.from(new Set(parts)).join(', ') : place.display_name ?? 'Unknown location'
}
