import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import Camera
from .base import CameraProvider, DiscoveredCamera


class RegistryProvider(CameraProvider):
    id = "registry"
    label = "ORBI RESQ registry"
    description = "Cameras already registered with this deployment, including authorized private sources."

    def __init__(self, db: Session):
        self.db = db

    async def discover(self, latitude: float, longitude: float, radius_km: float) -> list[DiscoveredCamera]:
        rows = self.db.scalars(select(Camera).where(Camera.status != "ARCHIVED")).all()
        return [
            DiscoveredCamera(
                provider=camera.provider,
                external_id=camera.external_id,
                name=camera.name,
                latitude=camera.latitude,
                longitude=camera.longitude,
                city=camera.city,
                district=camera.district,
                state=camera.state,
                country=camera.country,
                country_code=camera.country_code,
                source_type=camera.source_type,
                access_classification=camera.access_classification,
                stream_url=camera.stream_url,
                snapshot_url=camera.snapshot_url,
                attribution=camera.attribution,
                usage_restrictions=camera.usage_restrictions,
                metadata={"registered": True, "demo": camera.is_demo},
            )
            for camera in rows
        ]


class OverpassProvider(CameraProvider):
    id = "openstreetmap"
    label = "OpenStreetMap surveillance registry"
    description = "Public surveillance camera locations published in OpenStreetMap via the Overpass API."

    def __init__(self, url: str):
        self.url = url

    async def discover(self, latitude: float, longitude: float, radius_km: float) -> list[DiscoveredCamera]:
        radius_m = int(radius_km * 1000)
        query = f"""
[out:json][timeout:20];
(
  node(around:{radius_m},{latitude},{longitude})["man_made"="surveillance"];
  node(around:{radius_m},{latitude},{longitude})["highway"="speed_camera"];
  way(around:{radius_m},{latitude},{longitude})["man_made"="surveillance"];
);
out center tags 200;
"""
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                self.url,
                data={"data": query},
                headers={"User-Agent": "ORBI-RESQ/1.0 (camera discovery; contact operator)"},
            )
        response.raise_for_status()
        elements = response.json().get("elements", [])
        cameras: list[DiscoveredCamera] = []
        for element in elements:
            tags = element.get("tags", {})
            lat = element.get("lat") or (element.get("center") or {}).get("lat")
            lon = element.get("lon") or (element.get("center") or {}).get("lon")
            if lat is None or lon is None:
                continue
            webcam = (
                tags.get("contact:webcam")
                or tags.get("url:webcam")
                or tags.get("webcam")
                or tags.get("camera:url")
            )
            camera_type = tags.get("camera:type") or tags.get("surveillance:type")
            cameras.append(
                DiscoveredCamera(
                    provider=self.id,
                    external_id=f"{element.get('type')}/{element.get('id')}",
                    name=tags.get("name") or tags.get("operator") or f"Surveillance camera {element.get('id')}",
                    latitude=float(lat),
                    longitude=float(lon),
                    city=tags.get("addr:city"),
                    district=tags.get("addr:district") or tags.get("addr:county"),
                    state=tags.get("addr:state"),
                    country=tags.get("addr:country"),
                    source_type="web_page",
                    access_classification="unverified",
                    stream_url=webcam,
                    attribution="Camera location data © OpenStreetMap contributors (ODbL)",
                    usage_restrictions="Operator terms are unknown. Verify permission before accessing any stream.",
                    metadata={
                        "osm_type": element.get("type"),
                        "osm_id": element.get("id"),
                        "operator": tags.get("operator"),
                        "camera_type": camera_type,
                        "surveillance_zone": tags.get("surveillance:zone"),
                        "has_published_stream": bool(webcam),
                    },
                )
            )
        return cameras


class CaltransProvider(CameraProvider):
    id = "caltrans"
    label = "Caltrans CCTV (California, US)"
    description = "California Department of Transportation public CCTV status feed."

    def __init__(self, district: str = "03"):
        self.district = district.zfill(2)

    async def discover(self, latitude: float, longitude: float, radius_km: float) -> list[DiscoveredCamera]:
        if not (32.0 <= latitude <= 42.5 and -125.0 <= longitude <= -114.0):
            return []
        url = f"https://cwwp2.dot.ca.gov/data/d{self.district}/cctv/cctvStatusD{self.district}.json"
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.get(url, headers={"User-Agent": "ORBI-RESQ/1.0"})
        response.raise_for_status()
        cameras: list[DiscoveredCamera] = []
        for entry in response.json().get("data", []):
            record = entry.get("cctv", {})
            location = record.get("location", {})
            try:
                lat = float(location.get("latitude"))
                lon = float(location.get("longitude"))
            except (TypeError, ValueError):
                continue
            image_data = record.get("imageData", {})
            static_image = (image_data.get("static") or {}).get("currentImageURL")
            stream_url = (image_data.get("streamingVideoURL") or "").strip() or None
            cameras.append(
                DiscoveredCamera(
                    provider=self.id,
                    external_id=str(record.get("index") or record.get("locationName") or f"{lat},{lon}"),
                    name=record.get("locationName") or "Caltrans CCTV",
                    latitude=lat,
                    longitude=lon,
                    city=location.get("nearbyPlace"),
                    district=f"District {self.district}",
                    state="California",
                    country="United States",
                    country_code="US",
                    source_type="hls" if stream_url and ".m3u8" in stream_url else "jpeg_snapshot",
                    access_classification="public",
                    stream_url=stream_url or static_image,
                    snapshot_url=static_image,
                    attribution="California Department of Transportation (Caltrans) CCTV",
                    usage_restrictions="Caltrans public camera feed. Follow Caltrans terms of use.",
                    metadata={"route": location.get("route"), "direction": location.get("direction")},
                )
            )
        return cameras


class WindyProvider(CameraProvider):
    id = "windy"
    label = "Windy Webcams"
    description = "Windy Webcams API v3 directory of publicly listed webcams."
    required_environment = ["WINDY_API_KEY"]

    def __init__(self, api_key: str):
        self.api_key = api_key

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    @property
    def configuration_note(self) -> str | None:
        return None if self.api_key else "Set WINDY_API_KEY to enable the Windy Webcams provider."

    async def discover(self, latitude: float, longitude: float, radius_km: float) -> list[DiscoveredCamera]:
        params = {
            "nearby": f"{latitude:.4f},{longitude:.4f},{int(radius_km)}",
            "limit": 50,
            "include": "location,images,player",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                "https://api.windy.com/webcams/api/v3/webcams",
                params=params,
                headers={"x-windy-api-key": self.api_key},
            )
        response.raise_for_status()
        cameras: list[DiscoveredCamera] = []
        for webcam in response.json().get("webcams", []):
            location = webcam.get("location", {})
            lat = location.get("latitude")
            lon = location.get("longitude")
            if lat is None or lon is None:
                continue
            player = webcam.get("player", {}).get("live")
            image = (webcam.get("images", {}).get("current") or {}).get("preview")
            cameras.append(
                DiscoveredCamera(
                    provider=self.id,
                    external_id=str(webcam.get("webcamId")),
                    name=webcam.get("title") or "Windy webcam",
                    latitude=float(lat),
                    longitude=float(lon),
                    city=location.get("city"),
                    district=location.get("region"),
                    state=location.get("region"),
                    country=location.get("country"),
                    country_code=(location.get("country") or "")[:2].upper() or None,
                    source_type="web_page",
                    access_classification="public",
                    stream_url=player,
                    snapshot_url=image,
                    attribution="Windy Webcams API",
                    usage_restrictions="Windy webcam listing. Embedded player usage follows Windy terms.",
                    metadata={"status": webcam.get("status")},
                )
            )
        return cameras


class DirectoryProvider(CameraProvider):
    id = "directory"
    label = "Configured camera directory"
    description = "Operator-supplied JSON directory of authorized camera sources."
    required_environment = ["CAMERA_DIRECTORY_URL"]

    def __init__(self, directory_url: str):
        self.directory_url = directory_url

    @property
    def configured(self) -> bool:
        return bool(self.directory_url)

    @property
    def configuration_note(self) -> str | None:
        return None if self.directory_url else "Set CAMERA_DIRECTORY_URL to enable a custom camera directory."

    async def discover(self, latitude: float, longitude: float, radius_km: float) -> list[DiscoveredCamera]:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(self.directory_url, headers={"User-Agent": "ORBI-RESQ/1.0"})
        response.raise_for_status()
        payload = response.json()
        entries = payload.get("cameras", payload) if isinstance(payload, dict) else payload
        cameras: list[DiscoveredCamera] = []
        for entry in entries if isinstance(entries, list) else []:
            try:
                lat = float(entry["latitude"])
                lon = float(entry["longitude"])
            except (KeyError, TypeError, ValueError):
                continue
            cameras.append(
                DiscoveredCamera(
                    provider=self.id,
                    external_id=str(entry.get("id") or f"{lat},{lon}"),
                    name=entry.get("name") or "Directory camera",
                    latitude=lat,
                    longitude=lon,
                    city=entry.get("city"),
                    district=entry.get("district"),
                    state=entry.get("state"),
                    country=entry.get("country"),
                    country_code=entry.get("country_code"),
                    source_type=entry.get("source_type") or "web_page",
                    access_classification=entry.get("access_classification") or "authorized",
                    stream_url=entry.get("stream_url"),
                    snapshot_url=entry.get("snapshot_url"),
                    attribution=entry.get("attribution") or "Configured camera directory",
                    usage_restrictions=entry.get("usage_restrictions"),
                    metadata={"directory": self.directory_url},
                )
            )
        return cameras
