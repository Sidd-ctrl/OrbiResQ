from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Camera, Incident, Notification
from ..schemas import (
    INCIDENT_CATEGORIES,
    IncidentCreate,
    IncidentOut,
    IncidentSummary,
    IncidentUpdate,
    PaginatedIncidents,
)
from ..serializers import incident_out
from ..services import incidents as incident_service
from ..services.notifications import dispatch_incident

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("/categories")
def categories() -> dict:
    return {"categories": INCIDENT_CATEGORIES}


@router.get("/summary", response_model=IncidentSummary)
def summary(db: Session = Depends(get_db)) -> IncidentSummary:
    return incident_service.incident_summary(db)


@router.get("", response_model=PaginatedIncidents)
def list_incidents(
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    category: str | None = None,
    severity: str | None = None,
    verification_status: str | None = None,
    city: str | None = None,
    district: str | None = None,
    state: str | None = None,
    country: str | None = None,
    source: str | None = None,
    camera_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> PaginatedIncidents:
    rows, total = incident_service.list_incidents(
        db,
        page=page,
        page_size=page_size,
        category=category,
        severity=severity,
        verification_status=verification_status,
        city=city,
        district=district,
        state=state,
        country=country,
        source=source,
        camera_id=camera_id,
        date_from=date_from,
        date_to=date_to,
    )
    camera_ids = [row.camera_id for row in rows if row.camera_id]
    names: dict[str, str] = {}
    if camera_ids:
        for camera in db.scalars(select(Camera).where(Camera.id.in_(camera_ids))).all():
            names[camera.id] = camera.name
    items = [incident_out(row, names.get(row.camera_id or "")) for row in rows]
    return PaginatedIncidents(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=IncidentOut, status_code=201)
async def create_incident(payload: IncidentCreate, db: Session = Depends(get_db)) -> IncidentOut:
    incident, created = incident_service.create_incident(db, payload)
    if created and incident.severity in ("HIGH", "CRITICAL"):
        await dispatch_incident(db, incident)
    camera = db.get(Camera, incident.camera_id) if incident.camera_id else None
    return incident_out(incident, camera.name if camera else None)


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: str, db: Session = Depends(get_db)) -> IncidentOut:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    camera = db.get(Camera, incident.camera_id) if incident.camera_id else None
    return incident_out(incident, camera.name if camera else None)


@router.patch("/{incident_id}", response_model=IncidentOut)
def patch_incident(incident_id: str, payload: IncidentUpdate, db: Session = Depends(get_db)) -> IncidentOut:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    updated = incident_service.update_incident(db, incident, payload)
    camera = db.get(Camera, updated.camera_id) if updated.camera_id else None
    return incident_out(updated, camera.name if camera else None)


@router.get("/{incident_id}/notifications")
def incident_notifications(incident_id: str, db: Session = Depends(get_db)) -> dict:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    rows = db.scalars(
        select(Notification).where(Notification.incident_id == incident_id).order_by(Notification.created_at.desc())
    ).all()
    return {
        "incident_id": incident_id,
        "notifications": [
            {
                "id": row.id,
                "channel": row.channel,
                "status": row.status,
                "error": row.error,
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }
