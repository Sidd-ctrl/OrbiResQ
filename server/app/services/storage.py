from pathlib import Path

from ..config import get_settings


class StorageUnavailable(RuntimeError):
    pass


def _settings():
    return get_settings()


def dataset_root() -> Path:
    root = Path(_settings().data_dir) / "datasets"
    root.mkdir(parents=True, exist_ok=True)
    return root


def storage_status() -> dict:
    settings = _settings()
    if settings.storage_backend == "s3":
        configured = bool(settings.s3_bucket and settings.s3_access_key and settings.s3_secret_key)
        try:
            import boto3  # noqa: F401

            available = True
            detail = "S3 adapter available (boto3 installed)."
        except ImportError:
            available = False
            detail = "S3 adapter requires boto3. Install it or use local storage."
        return {
            "backend": "s3",
            "configured": configured,
            "available": available and configured,
            "detail": detail if configured else "S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY are required.",
            "root": settings.s3_bucket or None,
        }
    root = dataset_root()
    return {
        "backend": "local",
        "configured": True,
        "available": True,
        "detail": "Local dataset directory storage.",
        "root": str(root),
        "writable": _writable(root),
    }


def _writable(path: Path) -> bool:
    try:
        probe = path / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        return False


def save_bytes(dataset_id: str, filename: str, content: bytes) -> str:
    settings = _settings()
    if settings.storage_backend == "s3":
        try:
            import boto3
        except ImportError as exc:
            raise StorageUnavailable("S3 storage selected but boto3 is not installed.") from exc
        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
        )
        key = f"datasets/{dataset_id}/{filename}"
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=content)
        return f"s3://{settings.s3_bucket}/{key}"

    target_dir = dataset_root() / dataset_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / filename
    target.write_bytes(content)
    return str(target)
