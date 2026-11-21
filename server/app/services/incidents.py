import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Camera, Incident
from ..schemas import IncidentCreate, IncidentSummary, IncidentUpdate

DEDUPE_WINDOW_MINUTES = 15


def build_dedupe_key(category: str, camera_id: str | None, latitude: float, longitude: float, when: datetime) -> str:
    bucket = when.replace(second=0, microsecond=0)
    bucket = bucket - timedelta(minutes=bucket.minute % DEDUPE_WINDOW_MINUTES)
    anchor = camera_id or f"{round(latitude, 3)}:{round(longitude, 3)}"
    raw = f"{category}|{anchor}|{bucket.isoformat()}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def create_incident(db: Session, payload: IncidentCreate, is_demo: bool = False) -> tuple[Incident, bool]:
    detected_at = payload.detected_at or datetime.now(timezone.utc)
    if detected_at.tzinfo is None:
        detected_at = detected_at.replace(tzinfo=timezone.utc)

    camera = db.get(Camera, payload.camera_id) if payload.camera_id else None
    city = payload.city or (camera.city if camera else None)
    district = payload.district or (camera.district if camera else None)
    state = payload.state or (camera.state if camera else None)
    country = payload.country or (camera.country if camera else None)

    dedupe_key = build_dedupe_key(payload.category, payload.camera_id, payload.latitude, payload.longitude, detected_at)
    existing = db.scalar(select(Incident).where(Incident.dedupe_key == dedupe_key))
    if existing is not None:
        return existing, False

    incident = Incident(
        category=payload.category,
        severity=payload.severity,
        confidence=payload.confidence,
        detected_at=detected_at,
        camera_id=payload.camera_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        city=city,
        district=district,
        state=state,
        country=country,
        evidence_image_url=payload.evidence_image_url,
        video_reference=payload.video_reference,
        verification_status=payload.verification_status,
        source=payload.source,
        description=payload.description,
        dedupe_key=dedupe_key,
        is_demo=is_demo,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident, True


def update_incident(db: Session, incident: Incident, payload: IncidentUpdate) -> Incident:
    if payload.verification_status is not None:
        incident.verification_status = payload.verification_status
        if payload.verification_status == "verified" and incident.source == "ai":
            incident.source = "human"
    if payload.severity is not None:
        incident.severity = payload.severity
    if payload.description is not None:
        incident.description = payload.description
    if payload.acknowledged is not None:
        incident.acknowledged_at = datetime.now(timezone.utc) if payload.acknowledged else None
    incident.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(incident)
    return incident


def list_incidents(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    category: str | None = None,
    severity: str | None = None,
    verification_status: str | None = None,
    city: str | None = None,
    district: str | None = None,
    state: str | None = None,
    country: str | None = None,
    source: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    camera_id: str | None = None,
) -> tuple[list[Incident], int]:
    filters = []
    if category:
        filters.append(Incident.category == category)
    if severity:
        filters.append(Incident.severity == severity)
    if verification_status:
        filters.append(Incident.verification_status == verification_status)
    if city:
        filters.append(func.lower(Incident.city) == city.lower())
    if district:
        filters.append(func.lower(Incident.district) == district.lower())
    if state:
        filters.append(func.lower(Incident.state) == state.lower())
    if country:
        filters.append(func.lower(Incident.country) == country.lower())
    if source:
        filters.append(Incident.source == source)
    if camera_id:
        filters.append(Incident.camera_id == camera_id)
    if date_from:
        filters.append(Incident.detected_at >= date_from)
    if date_to:
        filters.append(Incident.detected_at <= date_to)

    total = db.scalar(select(func.count()).select_from(Incident).where(*filters)) or 0
    rows = db.scalars(
        select(Incident)
        .where(*filters)
        .order_by(Incident.detected_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return list(rows), total


def incident_summary(db: Session) -> IncidentSummary:
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)
    total = db.scalar(select(func.count()).select_from(Incident)) or 0
    last_24h = db.scalar(select(func.count()).select_from(Incident).where(Incident.detected_at >= since)) or 0

    def group(column) -> dict[str, int]:
        rows = db.execute(select(column, func.count()).group_by(column)).all()
        return {str(key): int(count) for key, count in rows}

    by_severity = group(Incident.severity)
    by_category = group(Incident.category)
    by_verification = group(Incident.verification_status)
    critical_open = (
        db.scalar(
            select(func.count())
            .select_from(Incident)
            .where(Incident.severity == "CRITICAL", Incident.verification_status.in_(["ai_detected", "verified"]))
        )
        or 0
    )
    return IncidentSummary(
        total=total,
        last_24h=last_24h,
        by_severity=by_severity,
        by_category=by_category,
        by_verification=by_verification,
        critical_open=critical_open,
    )
