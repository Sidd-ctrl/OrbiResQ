from typing import Any

from fastapi import APIRouter

from ..services.environment import collect_environment

router = APIRouter(prefix="/api/layers", tags=["layers"])


@router.get("/environment")
async def environment_layers() -> dict[str, Any]:
    return await collect_environment()
