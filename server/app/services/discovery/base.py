from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class DiscoveredCamera:
    provider: str
    external_id: str
    name: str
    latitude: float
    longitude: float
    city: str | None = None
    district: str | None = None
    state: str | None = None
    country: str | None = None
    country_code: str | None = None
    source_type: str = "web_page"
    access_classification: str = "unverified"
    stream_url: str | None = None
    snapshot_url: str | None = None
    attribution: str | None = None
    usage_restrictions: str | None = None
    metadata: dict = field(default_factory=dict)


class CameraProvider(ABC):
    id: str = "provider"
    label: str = "Provider"
    description: str = ""
    required_environment: list[str] = []

    @property
    def configured(self) -> bool:
        return True

    @property
    def configuration_note(self) -> str | None:
        return None

    @abstractmethod
    async def discover(self, latitude: float, longitude: float, radius_km: float) -> list[DiscoveredCamera]:
        raise NotImplementedError


def classify_source(url: str | None) -> str:
    if not url:
        return "web_page"
    lowered = url.lower().split("?")[0]
    if lowered.endswith(".m3u8") or "format=m3u8" in url.lower():
        return "hls"
    if lowered.endswith((".mp4", ".mjpg", ".mjpeg", ".webm")) or "mjpg" in lowered:
        return "http_video"
    if lowered.endswith((".jpg", ".jpeg", ".png")):
        return "jpeg_snapshot"
    if lowered.startswith("rtsp://"):
        return "rtsp"
    return "web_page"
