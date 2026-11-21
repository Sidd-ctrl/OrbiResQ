from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ModelRecord
from ..schemas import ModelCreate, ModelOut, ModelUpdate
from ..services.cv_client import cv_models

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=list[ModelOut])
def list_models(db: Session = Depends(get_db)) -> list[ModelOut]:
    rows = db.scalars(select(ModelRecord).order_by(ModelRecord.created_at.asc())).all()
    return [ModelOut.model_validate(row) for row in rows]


@router.get("/runtime")
async def runtime_models() -> dict:
    result = await cv_models()
    if not result["reachable"]:
        return {"reachable": False, "detail": result.get("detail"), "detectors": []}
    return {"reachable": True, "detectors": result["payload"].get("detectors", [])}


@router.post("", response_model=ModelOut, status_code=201)
def register_model(payload: ModelCreate, db: Session = Depends(get_db)) -> ModelOut:
    record = ModelRecord(
        name=payload.name,
        task=payload.task,
        framework=payload.framework,
        version=payload.version,
        weights_path=payload.weights_path,
        enabled=payload.enabled,
        config=payload.config,
        metrics=payload.metrics,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return ModelOut.model_validate(record)


@router.patch("/{model_id}", response_model=ModelOut)
def update_model(model_id: str, payload: ModelUpdate, db: Session = Depends(get_db)) -> ModelOut:
    record = db.get(ModelRecord, model_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model not found")
    data = payload.model_dump(exclude_none=True)
    for field, value in data.items():
        setattr(record, field, value)
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return ModelOut.model_validate(record)
