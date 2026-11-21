from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CameraStatus = Literal["LIVE", "OFFLINE", "UNVERIFIED", "RESTRICTED", "ARCHIVED"]
SourceType = Literal["hls", "http_video", "rtsp", "jpeg_snapshot", "web_page"]
AccessClass = Literal["public", "authorized", "unverified", "restricted"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
VerificationStatus = Literal["ai_detected", "verified", "false_positive", "resolved"]

INCIDENT_CATEGORIES = [
    "accident",
    "collision",
    "pothole",
    "flood",
    "waterlogging",
    "fire",
    "smoke",
    "fallen_tree",
    "road_obstruction",
    "debris",
    "landslide",
    "traffic_anomaly",
]


class LocationInfo(BaseModel):
    latitude: float
    longitude: float
    locality: str | None = None
    city: str | None = None
    district: str | None = None
    state: str | None = None
    country: str | None = None
    country_code: str | None = None
    postcode: str | None = None
    display_name: str | None = None
    source: str
    resolved_at: datetime
    note: str | None = None


class LocationCandidate(BaseModel):
    display_name: str
    latitude: float
    longitude: float
    locality: str | None = None
    city: str | None = None
    district: str | None = None
    state: str | None = None
    country: str | None = None


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    external_id: str
    name: str
    provider: str
    city: str | None
    district: str | None
    state: str | None
    country: str | None
    country_code: str | None
    latitude: float
    longitude: float
    source_type: str
    access_classification: str
    status: str
    stream_url: str | None
    snapshot_url: str | None
    attribution: str | None
    usage_restrictions: str | None
    last_validated_at: datetime | None
    last_validation_note: str | None
    validation_latency_ms: int | None
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    distance_km: float | None = None
    incident_count: int = 0


class CameraCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    city: str | None = None
    district: str | None = None
    state: str | None = None
    country: str | None = None
    country_code: str | None = None
    source_type: SourceType = "web_page"
    access_classification: AccessClass = "authorized"
    stream_url: str | None = None
    snapshot_url: str | None = None
    attribution: str | None = None
    usage_restrictions: str | None = None
    provider: str = "registry"


class CameraUpdate(BaseModel):
    name: str | None = None
    status: CameraStatus | None = None
    access_classification: AccessClass | None = None
    stream_url: str | None = None
    snapshot_url: str | None = None
    usage_restrictions: str | None = None


class ProviderReport(BaseModel):
    id: str
    label: str
    status: Literal["ok", "error", "skipped", "not_configured"]
    discovered: int = 0
    detail: str | None = None


class DiscoveryRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_km: float = Field(default=25.0, gt=0, le=100)
    providers: list[str] | None = None
    persist: bool = True


class DiscoveryResponse(BaseModel):
    latitude: float
    longitude: float
    radius_km: float
    providers: list[ProviderReport]
    cameras: list[CameraOut]
    total: int
    nearest: list[CameraOut] = []
    message: str | None = None


class StreamInfo(BaseModel):
    camera_id: str
    status: str
    playable: bool
    playback_kind: Literal["hls", "video", "snapshot", "external_page", "unavailable"]
    url: str | None
    attribution: str | None
    reason: str | None


class IncidentBase(BaseModel):
    category: str
    severity: Severity = "LOW"
    confidence: float | None = Field(default=None, ge=0, le=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    camera_id: str | None = None
    detected_at: datetime | None = None
    city: str | None = None
    district: str | None = None
    state: str | None = None
    country: str | None = None
    evidence_image_url: str | None = None
    video_reference: str | None = None
    description: str | None = None
    source: Literal["ai", "human", "demo"] = "ai"

    @field_validator("category")
    @classmethod
    def valid_category(cls, value: str) -> str:
        if value not in INCIDENT_CATEGORIES:
            raise ValueError(f"category must be one of {', '.join(INCIDENT_CATEGORIES)}")
        return value


class IncidentCreate(IncidentBase):
    verification_status: VerificationStatus = "ai_detected"


class IncidentUpdate(BaseModel):
    verification_status: VerificationStatus | None = None
    severity: Severity | None = None
    description: str | None = None
    acknowledged: bool | None = None


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    category: str
    severity: str
    confidence: float | None
    detected_at: datetime
    camera_id: str | None
    camera_name: str | None = None
    latitude: float
    longitude: float
    city: str | None
    district: str | None
    state: str | None
    country: str | None
    evidence_image_url: str | None
    video_reference: str | None
    verification_status: str
    source: str
    description: str | None
    is_demo: bool
    acknowledged_at: datetime | None
    created_at: datetime


class IncidentSummary(BaseModel):
    total: int
    last_24h: int
    by_severity: dict[str, int]
    by_category: dict[str, int]
    by_verification: dict[str, int]
    critical_open: int


class PaginatedIncidents(BaseModel):
    items: list[IncidentOut]
    total: int
    page: int
    page_size: int


class PaginatedCameras(BaseModel):
    items: list[CameraOut]
    total: int
    page: int
    page_size: int


class PaginatedNotifications(BaseModel):
    items: list[NotificationOut]
    total: int
    page: int
    page_size: int


class DatasetCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    category: str = Field(default="road_hazard", max_length=48)
    description: str | None = None
    storage_backend: Literal["local", "s3"] | None = None


class DatasetItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    media_type: str
    size_bytes: int
    status: str
    item_metadata: dict
    created_at: datetime


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: str
    description: str | None
    storage_backend: str
    storage_path: str | None
    size_bytes: int
    file_count: int
    processing_status: str
    dataset_metadata: dict
    is_demo: bool
    created_at: datetime
    items: list[DatasetItemOut] = []


class ModelCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    task: str = Field(max_length=48)
    framework: str = "ultralytics"
    version: str = "1.0.0"
    weights_path: str | None = None
    enabled: bool = True
    config: dict = {}
    metrics: dict = {}


class ModelUpdate(BaseModel):
    enabled: bool | None = None
    weights_path: str | None = None
    config: dict | None = None
    metrics: dict | None = None


class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    task: str
    framework: str
    version: str
    weights_path: str | None
    enabled: bool
    config: dict
    metrics: dict
    created_at: datetime


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    incident_id: str | None
    channel: str
    severity: str
    title: str
    body: str
    status: str
    error: str | None
    created_at: datetime
    acknowledged_at: datetime | None


class ChannelStatus(BaseModel):
    channel: str
    label: str
    configured: bool
    required_environment: list[str]
    detail: str


class HealthComponent(BaseModel):
    name: str
    status: Literal["ok", "degraded", "down", "not_configured"]
    detail: str


class HealthResponse(BaseModel):
    status: str
    app: str
    version: str
    environment: str
    uptime_seconds: float
    database_backend: str
    components: list[HealthComponent]
    counts: dict[str, int]


class AnalysisRequest(BaseModel):
    image_url: str | None = None
    camera_id: str | None = None
    detectors: list[str] | None = None


class SystemSettingsOut(BaseModel):
    search_radius_options_km: list[float]
    default_radius_km: float
    max_radius_km: float
    demo_data_enabled: bool
    storage_backend: str
    providers: list[dict]
    emergency_services_enabled: bool = False
