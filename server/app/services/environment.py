import time
from datetime import datetime, timezone
from typing import Any

import httpx

INDIA_BOUNDS = {"min_lat": 6.4, "max_lat": 35.9, "min_lon": 67.5, "max_lon": 97.8}
CACHE_TTL_SECONDS = 600

USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"

PRECIPITATION_GRID = [
    (lat, lon) for lat in (8.5, 12.5, 16.5, 20.5, 24.5, 28.5, 32.5) for lon in (70.5, 74.5, 78.5, 82.5, 86.5, 90.5, 94.5)
]

_cache: dict[str, Any] = {"expires_at": 0.0, "payload": None}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_source(source_id: str, label: str, attribution: str, detail: str) -> dict[str, Any]:
    return {
        "id": source_id,
        "label": label,
        "attribution": attribution,
        "status": "unavailable",
        "detail": detail,
        "count": 0,
    }


async def _fetch_earthquakes(client: httpx.AsyncClient) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    source = {
        "id": "usgs_earthquakes",
        "label": "Earthquakes · M2.5+",
        "attribution": "USGS Earthquake Hazards Program",
        "status": "live",
        "detail": "Last 24 hours, magnitude 2.5 and above",
        "count": 0,
    }
    try:
        response = await client.get(USGS_FEED)
        response.raise_for_status()
        payload = response.json()
    except Exception as error:  # noqa: BLE001 - provider errors are reported, never replaced with fake data
        return [], _empty_source(
            source["id"], source["label"], source["attribution"], f"USGS feed unreachable: {error.__class__.__name__}"
        )

    events: list[dict[str, Any]] = []
    for feature in payload.get("features", []):
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        if len(coordinates) < 2:
            continue
        longitude, latitude = float(coordinates[0]), float(coordinates[1])
        if not (
            INDIA_BOUNDS["min_lat"] <= latitude <= INDIA_BOUNDS["max_lat"]
            and INDIA_BOUNDS["min_lon"] <= longitude <= INDIA_BOUNDS["max_lon"]
        ):
            continue
        properties = feature.get("properties") or {}
        events.append(
            {
                "id": feature.get("id") or f"{latitude:.4f},{longitude:.4f}",
                "magnitude": properties.get("mag"),
                "place": properties.get("place") or "Unnamed epicentre",
                "latitude": latitude,
                "longitude": longitude,
                "depth_km": float(coordinates[2]) if len(coordinates) > 2 else None,
                "occurred_at": datetime.fromtimestamp((properties.get("time") or 0) / 1000, tz=timezone.utc).isoformat(),
                "url": properties.get("url"),
            }
        )

    events.sort(key=lambda event: event["magnitude"] or 0, reverse=True)
    source["count"] = len(events)
    if not events:
        source["status"] = "live"
        source["detail"] = "No magnitude 2.5+ events inside the India monitoring bounds in the last 24 hours"
    return events, source


async def _fetch_precipitation(client: httpx.AsyncClient) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    source = {
        "id": "open_meteo_rainfall",
        "label": "Heavy rainfall",
        "attribution": "Open-Meteo current conditions",
        "status": "live",
        "detail": "Observed precipitation across the India monitoring grid",
        "count": 0,
    }
    latitudes = ",".join(str(lat) for lat, _ in PRECIPITATION_GRID)
    longitudes = ",".join(str(lon) for _, lon in PRECIPITATION_GRID)
    params = {
        "latitude": latitudes,
        "longitude": longitudes,
        "current": "precipitation,rain,weather_code",
        "timezone": "UTC",
    }
    try:
        response = await client.get(OPEN_METEO_FORECAST, params=params)
        response.raise_for_status()
        payload = response.json()
    except Exception as error:  # noqa: BLE001
        return [], _empty_source(
            source["id"],
            source["label"],
            source["attribution"],
            f"Open-Meteo unreachable: {error.__class__.__name__}",
        )

    entries = payload if isinstance(payload, list) else [payload]
    points: list[dict[str, Any]] = []
    for entry in entries:
        current = entry.get("current") or {}
        precipitation = current.get("precipitation")
        if precipitation is None:
            continue
        latitude = entry.get("latitude")
        longitude = entry.get("longitude")
        if latitude is None or longitude is None:
            continue
        points.append(
            {
                "latitude": float(latitude),
                "longitude": float(longitude),
                "precipitation_mm": float(precipitation),
                "rain_mm": float(current.get("rain") or 0.0),
                "weather_code": current.get("weather_code"),
                "observed_at": current.get("time"),
            }
        )

    wet = [point for point in points if point["precipitation_mm"] >= 0.2]
    wet.sort(key=lambda point: point["precipitation_mm"], reverse=True)
    source["count"] = len(wet)
    source["detail"] = f"{len(points)} grid cells sampled · {len(wet)} reporting active precipitation"
    return wet, source


async def collect_environment() -> dict[str, Any]:
    cached_at = _cache["expires_at"]
    if _cache["payload"] and cached_at > time.time():
        return _cache["payload"]

    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        earthquakes, earthquake_source = await _fetch_earthquakes(client)
        precipitation, rainfall_source = await _fetch_precipitation(client)

    weather_source = _empty_source(
        "weather_alerts",
        "Extreme weather warnings",
        "No provider configured",
        "Official warning bulletins require an authorised national meteorological feed. None is configured for this deployment.",
    )
    payload = {
        "generated_at": _now(),
        "bounds": INDIA_BOUNDS,
        "sources": [earthquake_source, rainfall_source, weather_source],
        "earthquakes": earthquakes,
        "precipitation": precipitation,
    }
    _cache["payload"] = payload
    _cache["expires_at"] = time.time() + CACHE_TTL_SECONDS
    return payload
