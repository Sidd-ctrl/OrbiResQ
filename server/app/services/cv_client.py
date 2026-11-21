import httpx

from ..config import get_settings


def _base() -> str:
    return get_settings().cv_service_url.rstrip("/")


async def cv_health() -> dict:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{_base()}/health")
        if response.status_code == 200:
            return {"reachable": True, "payload": response.json()}
        return {"reachable": False, "detail": f"Computer vision service responded HTTP {response.status_code}."}
    except httpx.HTTPError as exc:
        return {"reachable": False, "detail": f"Computer vision service unreachable: {exc.__class__.__name__}."}


async def cv_models() -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{_base()}/v1/models")
        if response.status_code == 200:
            return {"reachable": True, "payload": response.json()}
        return {"reachable": False, "detail": f"Model registry responded HTTP {response.status_code}."}
    except httpx.HTTPError as exc:
        return {"reachable": False, "detail": f"Model registry unreachable: {exc.__class__.__name__}."}


async def cv_detect(image_url: str | None, detectors: list[str] | None) -> dict:
    payload = {"image_url": image_url, "detectors": detectors}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{_base()}/v1/detect", json=payload)
        if response.status_code == 200:
            return {"reachable": True, "payload": response.json()}
        return {
            "reachable": True,
            "payload": None,
            "detail": response.json().get("detail", f"Detection failed with HTTP {response.status_code}."),
            "status_code": response.status_code,
        }
    except httpx.HTTPError as exc:
        return {"reachable": False, "payload": None, "detail": f"Computer vision service unreachable: {exc.__class__.__name__}."}
