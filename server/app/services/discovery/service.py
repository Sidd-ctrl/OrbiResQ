import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...config import get_settings
from ...models import Camera
from ..geo import bounding_box, haversine_km
from .base import CameraProvider, DiscoveredCamera
from .providers import CaltransProvider, DirectoryProvider, OverpassProvider, RegistryProvider, WindyProvider

PROVIDER_TIMEOUT_SECONDS = 30.0


class DiscoveryService:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()

    def providers(self) -> list[CameraProvider]:
        providers: list[CameraProvider] = [RegistryProvider(self.db)]
        if self.settings.enable_osm_discovery:
            providers.append(OverpassProvider(self.settings.osm_overpass_url))
        if self.settings.enable_caltrans_discovery:
            providers.append(CaltransProvider(self.settings.caltrans_district))
        providers.append(WindyProvider(self.settings.windy_api_key))
        providers.append(DirectoryProvider(self.settings.camera_directory_url))
        return providers

    def _upsert(self, item: DiscoveredCamera) -> Camera:
        camera = self.db.scalar(
            select(Camera).where(Camera.provider == item.provider, Camera.external_id == item.external_id)
        )
        if camera is None:
            camera = Camera(
                provider=item.provider,
                external_id=item.external_id,
                name=item.name,
                latitude=item.latitude,
                longitude=item.longitude,
                status="UNVERIFIED",
            )
            self.db.add(camera)
        camera.name = item.name
        camera.latitude = item.latitude
        camera.longitude = item.longitude
        camera.city = item.city or camera.city
        camera.district = item.district or camera.district
        camera.state = item.state or camera.state
        camera.country = item.country or camera.country
        camera.country_code = item.country_code or camera.country_code
        camera.source_type = item.source_type
        camera.access_classification = item.access_classification
        camera.stream_url = item.stream_url or camera.stream_url
        camera.snapshot_url = item.snapshot_url or camera.snapshot_url
        camera.attribution = item.attribution or camera.attribution
        camera.usage_restrictions = item.usage_restrictions or camera.usage_restrictions
        camera.camera_metadata = {**(camera.camera_metadata or {}), **item.metadata}
        camera.updated_at = datetime.now(timezone.utc)
        if camera.status == "ARCHIVED":
            camera.status = "UNVERIFIED"
        return camera

    async def discover(
        self,
        latitude: float,
        longitude: float,
        radius_km: float,
        provider_ids: list[str] | None = None,
        persist: bool = True,
    ) -> dict:
        reports: list[dict] = []
        selected = [provider for provider in self.providers() if not provider_ids or provider.id in provider_ids]

        async def run(provider: CameraProvider) -> tuple[CameraProvider, list[DiscoveredCamera] | None, str | None]:
            if not provider.configured:
                return provider, None, provider.configuration_note or "Provider is not configured."
            try:
                items = await asyncio.wait_for(
                    provider.discover(latitude, longitude, radius_km), timeout=PROVIDER_TIMEOUT_SECONDS
                )
                return provider, items, None
            except asyncio.TimeoutError:
                return provider, None, "Provider timed out."
            except Exception as exc:  # noqa: BLE001
                return provider, None, f"{exc.__class__.__name__}: {exc}"[:300]

        results = await asyncio.gather(*(run(provider) for provider in selected))
        discovered_count = 0
        for provider, items, error in results:
            if not provider.configured:
                reports.append(
                    {
                        "id": provider.id,
                        "label": provider.label,
                        "status": "not_configured",
                        "discovered": 0,
                        "detail": provider.configuration_note,
                    }
                )
                continue
            if error:
                reports.append(
                    {"id": provider.id, "label": provider.label, "status": "error", "discovered": 0, "detail": error}
                )
                continue
            assert items is not None
            discovered_count += len(items)
            for item in items:
                self._upsert(item)
            reports.append(
                {
                    "id": provider.id,
                    "label": provider.label,
                    "status": "ok",
                    "discovered": len(items),
                    "detail": None,
                }
            )

        if persist:
            self.db.commit()

        return {
            "reports": reports,
            "discovered_count": discovered_count,
            "cameras": self.nearby(latitude, longitude, radius_km),
        }

    def nearby(self, latitude: float, longitude: float, radius_km: float, limit: int | None = None) -> list[dict]:
        min_lat, max_lat, min_lon, max_lon = bounding_box(latitude, longitude, radius_km)
        rows = self.db.scalars(
            select(Camera).where(
                Camera.status != "ARCHIVED",
                Camera.latitude >= min_lat,
                Camera.latitude <= max_lat,
                Camera.longitude >= min_lon,
                Camera.longitude <= max_lon,
            )
        ).all()
        enriched = []
        for camera in rows:
            distance = haversine_km(latitude, longitude, camera.latitude, camera.longitude)
            if distance <= radius_km:
                enriched.append((distance, camera))
        enriched.sort(key=lambda pair: pair[0])
        limit = limit or self.settings.max_discovery_results
        return [{"camera": camera, "distance_km": round(distance, 2)} for distance, camera in enriched[:limit]]

    def nearest_anywhere(self, latitude: float, longitude: float, limit: int = 5) -> list[dict]:
        rows = self.db.scalars(select(Camera).where(Camera.status != "ARCHIVED")).all()
        enriched = sorted(
            (
                (haversine_km(latitude, longitude, camera.latitude, camera.longitude), camera)
                for camera in rows
            ),
            key=lambda pair: pair[0],
        )
        return [{"camera": camera, "distance_km": round(distance, 2)} for distance, camera in enriched[:limit]]
