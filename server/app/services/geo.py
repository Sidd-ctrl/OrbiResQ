import math
import time

import httpx

from ..config import get_settings

EARTH_RADIUS_KM = 6371.0088
RADIUS_OPTIONS_KM = [5.0, 10.0, 25.0, 50.0, 100.0]
_geocode_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL_SECONDS = 3600


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def bounding_box(lat: float, lon: float, radius_km: float) -> tuple[float, float, float, float]:
    lat_delta = radius_km / 111.32
    cos_lat = max(math.cos(math.radians(lat)), 0.01)
    lon_delta = radius_km / (111.32 * cos_lat)
    return lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta


def _address_to_location(address: dict, display_name: str | None) -> dict:
    locality = (
        address.get("suburb")
        or address.get("neighbourhood")
        or address.get("quarter")
        or address.get("city_district")
        or address.get("village")
        or address.get("hamlet")
    )
    city = (
        address.get("city")
        or address.get("town")
        or address.get("municipality")
        or address.get("village")
        or address.get("county")
    )
    district = address.get("state_district") or address.get("district") or address.get("county")
    return {
        "locality": locality,
        "city": city,
        "district": district,
        "state": address.get("state") or address.get("region"),
        "country": address.get("country"),
        "country_code": (address.get("country_code") or "").upper() or None,
        "postcode": address.get("postcode"),
        "display_name": display_name,
    }


async def reverse_geocode(latitude: float, longitude: float) -> dict:
    settings = get_settings()
    key = f"{round(latitude, 4)}:{round(longitude, 4)}"
    cached = _geocode_cache.get(key)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    payload = {
        "latitude": latitude,
        "longitude": longitude,
        "source": "unavailable",
        "resolved_at": time.time(),
        "note": None,
    }
    params = {
        "format": "jsonv2",
        "lat": f"{latitude:.6f}",
        "lon": f"{longitude:.6f}",
        "zoom": 14,
        "addressdetails": 1,
        "accept-language": settings.geocode_language,
    }
    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params=params,
                headers={"User-Agent": settings.geocode_user_agent},
            )
        if response.status_code == 200:
            data = response.json()
            payload.update(_address_to_location(data.get("address", {}), data.get("display_name")))
            payload["source"] = "openstreetmap-nominatim"
        else:
            payload["note"] = f"Reverse geocoding returned HTTP {response.status_code}"
    except httpx.HTTPError as exc:
        payload["note"] = f"Reverse geocoding unavailable: {exc.__class__.__name__}"

    _geocode_cache[key] = (time.time(), payload)
    return payload


async def search_locations(query: str, limit: int = 6) -> list[dict]:
    settings = get_settings()
    params = {
        "format": "jsonv2",
        "q": query,
        "limit": limit,
        "addressdetails": 1,
        "accept-language": settings.geocode_language,
    }
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
        response = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers={"User-Agent": settings.geocode_user_agent},
        )
    if response.status_code != 200:
        return []
    results = []
    for item in response.json():
        address = item.get("address", {})
        mapped = _address_to_location(address, item.get("display_name"))
        results.append(
            {
                "display_name": item.get("display_name", ""),
                "latitude": float(item["lat"]),
                "longitude": float(item["lon"]),
                "locality": mapped["locality"],
                "city": mapped["city"],
                "district": mapped["district"],
                "state": mapped["state"],
                "country": mapped["country"],
            }
        )
    return results
