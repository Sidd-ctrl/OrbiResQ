import csv
import io
import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Dataset, DatasetItem
from ..schemas import DatasetCreate, DatasetOut
from ..services import storage

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

MEDIA_TYPES = {
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".webp": "image",
    ".mp4": "video",
    ".mov": "video",
    ".mkv": "video",
    ".avi": "video",
    ".csv": "csv",
    ".json": "json",
}


def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", Path(name).name)
    return cleaned[:200] or "upload.bin"


def _inspect(media_type: str, content: bytes) -> dict:
    if media_type == "csv":
        try:
            rows = list(csv.reader(io.StringIO(content.decode("utf-8", errors="replace"))))
            return {"rows": max(len(rows) - 1, 0), "columns": rows[0] if rows else []}
        except csv.Error:
            return {"rows": 0, "parse_error": "csv_parse_failed"}
    if media_type == "json":
        try:
            data = json.loads(content.decode("utf-8", errors="replace"))
            count = len(data) if isinstance(data, (list, dict)) else 1
            return {"records": count, "root_type": type(data).__name__}
        except json.JSONDecodeError:
            return {"records": 0, "parse_error": "json_parse_failed"}
    if media_type == "image":
        try:
            from PIL import Image

            with Image.open(io.BytesIO(content)) as image:
                return {"width": image.width, "height": image.height, "format": image.format}
        except Exception:  # noqa: BLE001
            return {"dimensions": "unreadable"}
    if media_type == "video":
        return {"frames": "pending_extraction"}
    return {}


@router.get("", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db)) -> list[DatasetOut]:
    rows = db.scalars(select(Dataset).order_by(Dataset.created_at.desc())).all()
    return [DatasetOut.model_validate(row) for row in rows]


@router.post("", response_model=DatasetOut, status_code=201)
def create_dataset(payload: DatasetCreate, db: Session = Depends(get_db)) -> DatasetOut:
    backend = payload.storage_backend or get_settings().storage_backend
    if backend == "s3" and not storage.storage_status()["available"]:
        raise HTTPException(status_code=409, detail=storage.storage_status()["detail"])
    dataset = Dataset(
        name=payload.name,
        category=payload.category,
        description=payload.description,
        storage_backend=backend,
        processing_status="ready",
        dataset_metadata={"files": 0},
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return DatasetOut.model_validate(dataset)


@router.post("/import", response_model=DatasetOut, status_code=201)
async def import_files(
    db: Session = Depends(get_db),
    dataset_id: str | None = Form(default=None),
    dataset_name: str | None = Form(default=None),
    category: str = Form(default="road_hazard"),
    files: list[UploadFile] = File(default=[]),
    metadata: str | None = Form(default=None),
) -> DatasetOut:
    settings = get_settings()
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    dataset = db.get(Dataset, dataset_id) if dataset_id else None
    if dataset_id and dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset is None:
        dataset = Dataset(
            name=dataset_name or "Imported dataset",
            category=category,
            storage_backend=settings.storage_backend,
            processing_status="ready",
            dataset_metadata={"files": 0},
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)

    accepted = 0
    rejected: list[str] = []
    total_bytes = 0
    for upload in files:
        filename = _safe_name(upload.filename or "upload.bin")
        media_type = MEDIA_TYPES.get(Path(filename).suffix.lower())
        if media_type is None:
            rejected.append(f"{filename}: unsupported type")
            continue
        content = await upload.read()
        if len(content) > settings.max_upload_mb * 1024 * 1024:
            rejected.append(f"{filename}: exceeds {settings.max_upload_mb} MB")
            continue
        try:
            reference = storage.save_bytes(dataset.id, filename, content)
        except storage.StorageUnavailable as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        item = DatasetItem(
            dataset_id=dataset.id,
            filename=filename,
            media_type=media_type,
            size_bytes=len(content),
            status="ready",
            storage_ref=reference,
            item_metadata=_inspect(media_type, content),
        )
        db.add(item)
        accepted += 1
        total_bytes += len(content)

    if accepted == 0:
        db.rollback()
        raise HTTPException(status_code=400, detail={"message": "No files were accepted.", "rejected": rejected})

    dataset.size_bytes = (dataset.size_bytes or 0) + total_bytes
    dataset.file_count = (dataset.file_count or 0) + accepted
    dataset.dataset_metadata = {
        **(dataset.dataset_metadata or {}),
        "files": dataset.file_count,
        "last_import": {"accepted": accepted, "rejected": rejected, "metadata": metadata},
    }
    db.commit()
    db.refresh(dataset)
    return DatasetOut.model_validate(dataset)


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)) -> DatasetOut:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return DatasetOut.model_validate(dataset)


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)) -> None:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    db.delete(dataset)
    db.commit()
