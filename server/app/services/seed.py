from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Camera, Dataset, Incident, ModelRecord, Notification, SystemSetting

DEMO_NOTE = "Demonstration record. No public stream is configured for this entry."

DEMO_CAMERAS = [
    ("Jaydev Vihar Junction", 20.2961, 85.8245, "Bhubaneswar", "Khordha", "Odisha", "India"),
    ("Master Canteen Square", 20.2724, 85.8401, "Bhubaneswar", "Khordha", "Odisha", "India"),
    ("Patia Ring Road", 20.3555, 85.8189, "Bhubaneswar", "Khordha", "Odisha", "India"),
    ("Cuttack Link Road", 20.4625, 85.8828, "Cuttack", "Cuttack", "Odisha", "India"),
    ("Connaught Place Outer Ring", 28.6315, 77.2167, "New Delhi", "New Delhi", "Delhi", "India"),
    ("Silk Board Junction", 12.9172, 77.6229, "Bengaluru", "Bengaluru Urban", "Karnataka", "India"),
]

DEMO_INCIDENTS = [
    ("waterlogging", "HIGH", 0.71, 20.2961, 85.8245, "Bhubaneswar", "Khordha", "Odisha", "India", 6),
    ("pothole", "MEDIUM", 0.64, 20.2724, 85.8401, "Bhubaneswar", "Khordha", "Odisha", "India", 14),
    ("road_obstruction", "HIGH", 0.58, 20.3555, 85.8189, "Bhubaneswar", "Khordha", "Odisha", "India", 26),
    ("collision", "CRITICAL", 0.82, 20.4625, 85.8828, "Cuttack", "Cuttack", "Odisha", "India", 40),
]

DEMO_MODELS = [
    ("Vehicle and pedestrian detector", "object_detection", "ultralytics", "yolov8n", {}),
    ("Road anomaly classifier", "road_anomaly", "pytorch", "road-anomaly-v1", {}),
    ("Environmental hazard classifier", "environment", "pytorch", "env-hazard-v1", {}),
    ("Temporal collision analyser", "accident", "internal", "temporal-v1", {}),
    ("Traffic density analyser", "traffic", "opencv", "density-v1", {}),
]


def seed_demo_data(db: Session) -> dict:
    created = {"cameras": 0, "incidents": 0, "models": 0, "datasets": 0}

    existing_cameras = db.scalar(select(func.count()).select_from(Camera)) or 0
    if existing_cameras == 0:
        for name, lat, lon, city, district, state, country in DEMO_CAMERAS:
            db.add(
                Camera(
                    provider="registry",
                    external_id=f"demo-{name.lower().replace(' ', '-')}",
                    name=f"{name} (demo)",
                    latitude=lat,
                    longitude=lon,
                    city=city,
                    district=district,
                    state=state,
                    country=country,
                    country_code="IN",
                    source_type="web_page",
                    access_classification="authorized",
                    status="UNVERIFIED",
                    attribution="ORBI RESQ demonstration registry",
                    usage_restrictions=DEMO_NOTE,
                    is_demo=True,
                    camera_metadata={"demo": True, "reason": "Seeded demonstration entry"},
                )
            )
            created["cameras"] += 1

    existing_incidents = db.scalar(select(func.count()).select_from(Incident)) or 0
    if existing_incidents == 0:
        now = datetime.now(timezone.utc)
        for index, row in enumerate(DEMO_INCIDENTS):
            category, severity, confidence, lat, lon, city, district, state, country, hours_ago = row
            db.add(
                Incident(
                    category=category,
                    severity=severity,
                    confidence=confidence,
                    detected_at=now - timedelta(hours=hours_ago),
                    latitude=lat,
                    longitude=lon,
                    city=city,
                    district=district,
                    state=state,
                    country=country,
                    verification_status="ai_detected",
                    source="demo",
                    description="Demonstration detection. Replace with model output or verified field report.",
                    dedupe_key=f"demo-incident-{index}",
                    is_demo=True,
                )
            )
            created["incidents"] += 1

    existing_models = db.scalar(select(func.count()).select_from(ModelRecord)) or 0
    if existing_models == 0:
        for name, task, framework, version, config in DEMO_MODELS:
            db.add(
                ModelRecord(
                    name=name,
                    task=task,
                    framework=framework,
                    version=version,
                    weights_path=None,
                    enabled=True,
                    config={"weights_installed": False, **config},
                    metrics={},
                )
            )
            created["models"] += 1

    existing_datasets = db.scalar(select(func.count()).select_from(Dataset)) or 0
    if existing_datasets == 0:
        db.add(
            Dataset(
                name="Demo road hazard sample set",
                category="road_hazard",
                description="Placeholder dataset record so the import workflow can be exercised.",
                storage_backend="local",
                storage_path=None,
                size_bytes=0,
                file_count=0,
                processing_status="ready",
                dataset_metadata={"demo": True, "note": "No files attached yet."},
                is_demo=True,
            )
        )
        created["datasets"] += 1

    if db.get(SystemSetting, "platform") is None:
        db.add(
            SystemSetting(
                key="platform",
                value={
                    "emergency_services_enabled": False,
                    "default_radius_km": 25,
                    "note": "Emergency service dispatch is intentionally disabled in this release.",
                },
            )
        )

    db.commit()
    return created


def platform_settings(db: Session) -> dict:
    record = db.get(SystemSetting, "platform")
    return record.value if record else {}
