from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Camera, Dataset, Incident, ModelRecord, Notification, SystemSetting
from ..runtime import STARTED_AT
from ..schemas import HealthComponent, HealthResponse, SystemSettingsOut
from ..services import storage
from ..services.cv_client import cv_health
from ..services.geo import RADIUS_OPTIONS_KM
from ..services.notifications import channel_status
from ..services.seed import platform_settings

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health", response_model=HealthResponse)
async def health(db: Session = Depends(get_db)) -> HealthResponse:
    settings = get_settings()
    components: list[HealthComponent] = []

    try:
        db.execute(select(func.count()).select_from(Camera))
        components.append(
            HealthComponent(name="database", status="ok", detail=f"Connected ({settings.database_url.split(':')[0]}).")
        )
        database_ok = True
    except Exception as exc:  # noqa: BLE001
        components.append(
            HealthComponent(name="database", status="down", detail=f"{exc.__class__.__name__}: {exc}"[:200])
        )
        database_ok = False

    vision = await cv_health()
    if vision["reachable"]:
        payload = vision["payload"]
        components.append(
            HealthComponent(
                name="computer_vision",
                status="ok" if payload.get("status") == "ok" else "degraded",
                detail=payload.get("summary", "Computer vision service reachable."),
            )
        )
    else:
        components.append(HealthComponent(name="computer_vision", status="down", detail=vision.get("detail", "")))

    storage_info = storage.storage_status()
    components.append(
        HealthComponent(
            name="storage",
            status="ok" if storage_info["available"] else "degraded",
            detail=storage_info["detail"],
        )
    )

    providers = [
        {"id": "registry", "label": "ORBI RESQ registry", "configured": True},
        {"id": "openstreetmap", "label": "OpenStreetMap surveillance", "configured": settings.enable_osm_discovery},
        {"id": "caltrans", "label": "Caltrans CCTV", "configured": settings.enable_caltrans_discovery},
        {"id": "windy", "label": "Windy webcams", "configured": bool(settings.windy_api_key)},
        {"id": "directory", "label": "Configured camera directory", "configured": bool(settings.camera_directory_url)},
    ]
    components.append(
        HealthComponent(
            name="discovery",
            status="ok",
            detail=f"{sum(1 for provider in providers if provider['configured'])} of {len(providers)} providers configured.",
        )
    )

    overall = "ok"
    if not database_ok or any(component.status == "down" for component in components):
        overall = "degraded"

    counts = {
        "cameras": db.scalar(select(func.count()).select_from(Camera)) or 0,
        "incidents": db.scalar(select(func.count()).select_from(Incident)) or 0,
        "datasets": db.scalar(select(func.count()).select_from(Dataset)) or 0,
        "models": db.scalar(select(func.count()).select_from(ModelRecord)) or 0,
        "notifications": db.scalar(select(func.count()).select_from(Notification)) or 0,
    }

    return HealthResponse(
        status=overall,
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
        uptime_seconds=round((datetime.now(timezone.utc) - STARTED_AT).total_seconds(), 1),
        database_backend=settings.database_url.split(":")[0],
        components=components,
        counts=counts,
    )


@router.get("/settings", response_model=SystemSettingsOut)
def get_settings_endpoint(db: Session = Depends(get_db)) -> SystemSettingsOut:
    settings = get_settings()
    values = platform_settings(db)
    return SystemSettingsOut(
        search_radius_options_km=RADIUS_OPTIONS_KM,
        default_radius_km=values.get("default_radius_km", settings.default_radius_km),
        max_radius_km=settings.max_radius_km,
        demo_data_enabled=settings.seed_demo_data,
        storage_backend=settings.storage_backend,
        providers=[
            {
                "id": "registry",
                "label": "ORBI RESQ registry",
                "description": "Registered and authorized camera sources.",
                "configured": True,
            },
            {
                "id": "openstreetmap",
                "label": "OpenStreetMap surveillance",
                "description": "Public surveillance nodes mapped in OpenStreetMap.",
                "configured": settings.enable_osm_discovery,
            },
            {
                "id": "caltrans",
                "label": "Caltrans CCTV",
                "description": "California DOT public camera API.",
                "configured": settings.enable_caltrans_discovery,
            },
            {
                "id": "windy",
                "label": "Windy webcams",
                "description": "Windy public webcam API.",
                "configured": bool(settings.windy_api_key),
                "required_environment": ["WINDY_API_KEY"],
            },
            {
                "id": "directory",
                "label": "Camera directory",
                "description": "Operator-configured JSON camera directory.",
                "configured": bool(settings.camera_directory_url),
                "required_environment": ["CAMERA_DIRECTORY_URL"],
            },
        ],
        emergency_services_enabled=bool(values.get("emergency_services_enabled", False)),
    )


@router.patch("/settings", response_model=SystemSettingsOut)
def update_settings(payload: dict, db: Session = Depends(get_db)) -> SystemSettingsOut:
    record = db.get(SystemSetting, "platform")
    if record is None:
        record = SystemSetting(key="platform", value={})
        db.add(record)
    values = dict(record.value or {})
    if "default_radius_km" in payload:
        radius = float(payload["default_radius_km"])
        if radius not in RADIUS_OPTIONS_KM:
            raise HTTPException(status_code=400, detail=f"default_radius_km must be one of {RADIUS_OPTIONS_KM}")
        values["default_radius_km"] = radius
    if "emergency_services_enabled" in payload:
        raise HTTPException(
            status_code=409,
            detail="Emergency service dispatch is not implemented in this release and cannot be enabled.",
        )
    record.value = values
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    return get_settings_endpoint(db)


@router.get("/storage")
def storage_information() -> dict:
    return storage.storage_status()


@router.get("/channels")
def notification_channels() -> dict:
    return {"channels": channel_status()}
