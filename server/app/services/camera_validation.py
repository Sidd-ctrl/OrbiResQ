import socket
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

from ..config import get_settings
from ..models import Camera

MEDIA_CONTENT_TYPES = (
    "video/",
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "image/jpeg",
    "image/png",
    "multipart/x-mixed-replace",
)


def _note(text: str) -> str:
    return text[:400]


async def validate_camera(camera: Camera) -> Camera:
    settings = get_settings()
    started = time.perf_counter()
    url = camera.stream_url or camera.snapshot_url
    now = datetime.now(timezone.utc)

    if not url:
        camera.status = "UNVERIFIED"
        camera.last_validation_note = _note("No machine-readable stream URL is published for this source.")
        camera.last_validated_at = now
        camera.validation_latency_ms = int((time.perf_counter() - started) * 1000)
        return camera

    parsed = urlparse(url)
    if parsed.scheme in ("rtsp", "rtsps"):
        host = parsed.hostname
        port = parsed.port or 554
        if not host:
            camera.status = "OFFLINE"
            camera.last_validation_note = _note("Stream URL has no reachable host.")
        else:
            try:
                with socket.create_connection((host, port), timeout=6):
                    camera.status = "UNVERIFIED"
                    camera.last_validation_note = _note(
                        f"TCP port {port} reachable, but the RTSP stream was not decoded. "
                        "Configure a media gateway to confirm playback."
                    )
            except OSError as exc:
                camera.status = "OFFLINE"
                camera.last_validation_note = _note(f"RTSP connection failed: {exc}")
        camera.last_validated_at = now
        camera.validation_latency_ms = int((time.perf_counter() - started) * 1000)
        return camera

    if parsed.scheme not in ("http", "https"):
        camera.status = "RESTRICTED"
        camera.last_validation_note = _note(f"Unsupported source scheme '{parsed.scheme or 'unknown'}'.")
        camera.last_validated_at = now
        return camera

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds, follow_redirects=True) as client:
            async with client.stream(
                "GET", url, headers={"User-Agent": settings.geocode_user_agent, "Range": "bytes=0-2048"}
            ) as response:
                content_type = (response.headers.get("content-type") or "").lower()
                if response.status_code in (401, 403):
                    camera.status = "RESTRICTED"
                    camera.last_validation_note = _note(
                        f"Source refused access with HTTP {response.status_code}. Access is restricted."
                    )
                elif response.status_code >= 400:
                    camera.status = "OFFLINE"
                    camera.last_validation_note = _note(f"Source responded with HTTP {response.status_code}.")
                elif camera.source_type == "web_page":
                    camera.status = "UNVERIFIED"
                    camera.last_validation_note = _note(
                        "Camera page is reachable, but no direct video stream is published."
                    )
                elif any(token in content_type for token in MEDIA_CONTENT_TYPES):
                    chunk = b""
                    async for part in response.aiter_bytes():
                        chunk = part
                        break
                    if chunk:
                        camera.status = "LIVE"
                        camera.last_validation_note = _note(
                            f"Stream responded with HTTP {response.status_code} ({content_type or 'unknown type'})."
                        )
                    else:
                        camera.status = "OFFLINE"
                        camera.last_validation_note = _note("Source returned no media bytes.")
                else:
                    camera.status = "OFFLINE"
                    camera.last_validation_note = _note(
                        f"Response was not a media stream (content-type: {content_type or 'unknown'})."
                    )
    except (httpx.HTTPError, OSError) as exc:
        camera.status = "OFFLINE"
        camera.last_validation_note = _note(f"Connection failed: {exc.__class__.__name__}")

    camera.last_validated_at = now
    camera.validation_latency_ms = int((time.perf_counter() - started) * 1000)
    return camera
