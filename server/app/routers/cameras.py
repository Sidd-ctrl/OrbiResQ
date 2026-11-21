from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Camera, Incident
from ..schemas import (
    CameraCreate,
    CameraOut,
    CameraUpdate,
    DiscoveryRequest,
    DiscoveryResponse,
    PaginatedCameras,
    StreamInfo,
)
from ..serializers import camera_out
from ..services.camera_validation import validate_camera
from ..services.discovery.service import DiscoveryService
from ..services.geo import RADIUS_OPTIONS_KM, haversine_km

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


def _incident_counts(db: Session, camera_ids: list[str]) -> dict[str, int]:
    if not camera_ids:
        return {}
    rows = db.execute(
        select(Incident.camera_id, func.count())
        .where(Incident.camera_id.in_(camera_ids))
        .group_by(Incident.camera_id)
    ).all()
    return {camera_id: int(count) for camera_id, count in rows if camera_id}


@router.post("/discover", response_model=DiscoveryResponse)
async def discover_cameras(payload: DiscoveryRequest, db: Session = Depends(get_db)) -> DiscoveryResponse:
    service = DiscoveryService(db)
    result = await service.discover(
        payload.latitude,
        payload.longitude,
        payload.radius_km,
        provider_ids=payload.providers,
        persist=payload.persist,
    )
    counts = _incident_counts(db, [entry["camera"].id for entry in result["cameras"]])
    cameras = [
        camera_out(entry["camera"], entry["distance_km"], counts.get(entry["camera"].id, 0))
        for entry in result["cameras"]
    ]
    nearest = []
    message = None
    if not cameras:
        nearest = [
            camera_out(entry["camera"], entry["distance_km"], counts.get(entry["camera"].id, 0))
            for entry in service.nearest_anywhere(payload.latitude, payload.longitude)
        ]
        message = "No accessible live camera feeds found in this location."
        if not nearest:
            message = "No registered cameras exist in the registry yet. Register an authorized source to begin monitoring."
    return DiscoveryResponse(
        latitude=payload.latitude,
        longitude=payload.longitude,
        radius_km=payload.radius_km,
        providers=result["reports"],
        cameras=cameras,
        total=len(cameras),
        nearest=nearest,
        message=message,
    )


@router.get("", response_model=PaginatedCameras)
def list_cameras(
    db: Session = Depends(get_db),
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float | None = Query(default=None, gt=0, le=100),
    status: str | None = None,
    provider: str | None = None,
    city: str | None = None,
    search: str | None = None,
    include_archived: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> PaginatedCameras:
    filters = []
    if not include_archived:
        filters.append(Camera.status != "ARCHIVED")
    if status:
        filters.append(Camera.status == status.upper())
    if provider:
        filters.append(Camera.provider == provider)
    if city:
        filters.append(func.lower(Camera.city) == city.lower())
    if search:
        filters.append(Camera.name.ilike(f"%{search}%"))

    rows = list(db.scalars(select(Camera).where(*filters)).all())
    if latitude is not None and longitude is not None:
        limit = radius_km or get_settings().max_radius_km
        rows = [
            camera
            for camera in rows
            if haversine_km(latitude, longitude, camera.latitude, camera.longitude) <= limit
        ]
        rows.sort(key=lambda camera: haversine_km(latitude, longitude, camera.latitude, camera.longitude))

    total = len(rows)
    page_rows = rows[(page - 1) * page_size : page * page_size]
    counts = _incident_counts(db, [camera.id for camera in page_rows])
    items = []
    for camera in page_rows:
        distance = (
            haversine_km(latitude, longitude, camera.latitude, camera.longitude)
            if latitude is not None and longitude is not None
            else None
        )
        items.append(camera_out(camera, round(distance, 2) if distance is not None else None, counts.get(camera.id, 0)))
    return PaginatedCameras(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=CameraOut, status_code=201)
def register_camera(payload: CameraCreate, db: Session = Depends(get_db)) -> CameraOut:
    external_id = f"registered-{datetime.now(timezone.utc).timestamp():.0f}"
    camera = Camera(
        provider=payload.provider or "registry",
        external_id=external_id,
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        city=payload.city,
        district=payload.district,
        state=payload.state,
        country=payload.country,
        country_code=payload.country_code,
        source_type=payload.source_type,
        access_classification=payload.access_classification,
        status="UNVERIFIED",
        stream_url=payload.stream_url,
        snapshot_url=payload.snapshot_url,
        attribution=payload.attribution or "Registered by platform operator",
        usage_restrictions=payload.usage_restrictions,
        camera_metadata={"registered": True},
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera_out(camera)


@router.get("/radius-options")
def radius_options() -> dict:
    return {"options_km": RADIUS_OPTIONS_KM, "default_km": get_settings().default_radius_km}


@router.get("/{camera_id}", response_model=CameraOut)
def get_camera(camera_id: str, db: Session = Depends(get_db)) -> CameraOut:
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    counts = _incident_counts(db, [camera.id])
    return camera_out(camera, None, counts.get(camera.id, 0))


@router.patch("/{camera_id}", response_model=CameraOut)
def update_camera(camera_id: str, payload: CameraUpdate, db: Session = Depends(get_db)) -> CameraOut:
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    data = payload.model_dump(exclude_none=True)
    for field, value in data.items():
        setattr(camera, field, value)
    camera.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(camera)
    return camera_out(camera)


@router.post("/{camera_id}/validate", response_model=CameraOut)
async def validate(camera_id: str, db: Session = Depends(get_db)) -> CameraOut:
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    await validate_camera(camera)
    db.commit()
    db.refresh(camera)
    counts = _incident_counts(db, [camera.id])
    return camera_out(camera, None, counts.get(camera.id, 0))


@router.get("/{camera_id}/stream", response_model=StreamInfo)
def stream_info(camera_id: str, db: Session = Depends(get_db)) -> StreamInfo:
    settings = get_settings()
    camera = db.get(Camera, camera_id)
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found")

    if camera.status == "ARCHIVED":
        return StreamInfo(
            camera_id=camera.id,
            status=camera.status,
            playable=False,
            playback_kind="unavailable",
            url=None,
            attribution=camera.attribution,
            reason="Camera is archived.",
        )
    if camera.status == "RESTRICTED":
        return StreamInfo(
            camera_id=camera.id,
            status=camera.status,
            playable=False,
            playback_kind="unavailable",
            url=None,
            attribution=camera.attribution,
            reason="Access to this source is restricted by the operator.",
        )
    if not camera.stream_url:
        return StreamInfo(
            camera_id=camera.id,
            status=camera.status,
            playable=False,
            playback_kind="unavailable",
            url=None,
            attribution=camera.attribution,
            reason="No machine-readable stream is published for this camera.",
        )

    if camera.source_type == "rtsp":
        if settings.media_gateway_url:
            proxied = f"{settings.media_gateway_url.rstrip('/')}/stream?src={quote(camera.stream_url, safe='')}"
            return StreamInfo(
                camera_id=camera.id,
                status=camera.status,
                playable=True,
                playback_kind="hls",
                url=proxied,
                attribution=camera.attribution,
                reason="RTSP converted to HLS by the configured media gateway.",
            )
        return StreamInfo(
            camera_id=camera.id,
            status=camera.status,
            playable=False,
            playback_kind="unavailable",
            url=None,
            attribution=camera.attribution,
            reason="RTSP playback requires a configured media gateway (MEDIA_GATEWAY_URL).",
        )

    kind = {
        "hls": "hls",
        "http_video": "video",
        "jpeg_snapshot": "snapshot",
        "web_page": "external_page",
    }.get(camera.source_type, "external_page")

    return StreamInfo(
        camera_id=camera.id,
        status=camera.status,
        playable=kind in ("hls", "video", "snapshot"),
        playback_kind=kind,
        url=camera.stream_url,
        attribution=camera.attribution,
        reason=None
        if kind in ("hls", "video", "snapshot")
        else "This source exposes a camera page, not a direct video stream.",
    )
