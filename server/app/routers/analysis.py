from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Camera
from ..schemas import AnalysisRequest
from ..services.cv_client import cv_detect, cv_models

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/capabilities")
async def capabilities() -> dict:
    result = await cv_models()
    if not result["reachable"]:
        raise HTTPException(status_code=503, detail=result.get("detail", "Computer vision service unavailable."))
    return result["payload"]


@router.post("/detect")
async def detect(payload: AnalysisRequest, db: Session = Depends(get_db)) -> dict:
    image_url = payload.image_url
    if image_url is None and payload.camera_id:
        camera = db.get(Camera, payload.camera_id)
        if camera is None:
            raise HTTPException(status_code=404, detail="Camera not found")
        image_url = camera.snapshot_url or camera.stream_url
        if not image_url:
            raise HTTPException(
                status_code=409,
                detail="This camera publishes no snapshot or stream that the vision service can read.",
            )
    if not image_url:
        raise HTTPException(status_code=400, detail="Provide image_url or camera_id.")

    result = await cv_detect(image_url, payload.detectors)
    if not result["reachable"]:
        raise HTTPException(status_code=503, detail=result.get("detail"))
    if result.get("payload") is None:
        raise HTTPException(status_code=result.get("status_code", 502), detail=result.get("detail"))
    return result["payload"]
