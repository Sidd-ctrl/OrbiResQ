from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Notification
from ..schemas import ChannelStatus, NotificationOut, PaginatedNotifications
from ..services.notifications import channel_status

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/channels", response_model=list[ChannelStatus])
def channels() -> list[ChannelStatus]:
    return [ChannelStatus(**item) for item in channel_status()]


@router.get("", response_model=PaginatedNotifications)
def list_notifications(
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    severity: str | None = None,
    channel: str | None = None,
    status: str | None = None,
    unacknowledged_only: bool = False,
) -> PaginatedNotifications:
    filters = []
    if severity:
        filters.append(Notification.severity == severity.upper())
    if channel:
        filters.append(Notification.channel == channel)
    if status:
        filters.append(Notification.status == status)
    if unacknowledged_only:
        filters.append(Notification.acknowledged_at.is_(None))

    total = db.scalar(select(func.count()).select_from(Notification).where(*filters)) or 0
    rows = db.scalars(
        select(Notification)
        .where(*filters)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedNotifications(
        items=[NotificationOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{notification_id}/acknowledge", response_model=NotificationOut)
def acknowledge(notification_id: str, db: Session = Depends(get_db)) -> NotificationOut:
    record = db.get(Notification, notification_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    record.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return NotificationOut.model_validate(record)


@router.post("/test", response_model=NotificationOut, status_code=201)
def test_alert(db: Session = Depends(get_db)) -> NotificationOut:
    record = Notification(
        incident_id=None,
        channel="in_app",
        severity="LOW",
        title="Test alert",
        body="Explicitly identified test event. No incident record was created and no emergency service was contacted.",
        status="delivered",
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return NotificationOut.model_validate(record)
