import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .detectors.registry import registry_capabilities, run_detectors

app = FastAPI(
    title="ORBI RESQ Computer Vision",
    version="1.0.0",
    description="Modular detection service. Only detectors with installed weights run inference.",
)


class DetectRequest(BaseModel):
    image_url: str | None = Field(default=None, max_length=2000)
    detectors: list[str] | None = None


@app.get("/health")
def health() -> dict:
    capabilities = registry_capabilities()
    ready = [item.id for item in capabilities if item.state == "ready"]
    return {
        "status": "ok",
        "service": "orbi-resq-vision",
        "detectors": len(capabilities),
        "ready": ready,
        "summary": f"{len(ready)} of {len(capabilities)} detectors have installed weights.",
    }


@app.get("/v1/models")
def models() -> dict:
    capabilities = registry_capabilities()
    return {
        "detectors": [
            {
                "id": item.id,
                "label": item.label,
                "task": item.task,
                "state": item.state,
                "detail": item.detail,
                "requires": item.requires,
            }
            for item in capabilities
        ]
    }


@app.post("/v1/detect")
def detect(payload: DetectRequest) -> dict:
    if not payload.image_url:
        raise HTTPException(status_code=400, detail="image_url is required.")
    if not payload.image_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="image_url must be an http or https source.")
    try:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            response = client.get(payload.image_url, headers={"User-Agent": "ORBI-RESQ-Vision/1.0"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Frame could not be fetched: {exc.__class__.__name__}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Frame source responded HTTP {response.status_code}.")
    if len(response.content) > 12 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Frame exceeds the 12 MB processing limit.")
    return run_detectors(response.content, payload.detectors)
