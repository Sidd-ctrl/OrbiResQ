import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .config import BASE_DIR, get_settings
from .db import Base, SessionLocal, engine
from .routers import analysis, cameras, datasets, incidents, layers, location, models, notifications, system
from .services.seed import seed_demo_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("orbi.resq")

settings = get_settings()
CLIENT_DIST = BASE_DIR / "client" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    if settings.seed_demo_data:
        with SessionLocal() as db:
            created = seed_demo_data(db)
            logger.info("demo seed result %s", created)
    logger.info("ORBI RESQ API ready")
    yield


app = FastAPI(
    title="ORBI RESQ API",
    description="Global Road Intelligence and Emergency Detection System",
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (location, cameras, incidents, datasets, models, system, notifications, analysis, layers):
    app.include_router(module.router)


@app.get("/api", include_in_schema=False)
def api_root() -> dict:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "endpoints": [
            "/api/location/current",
            "/api/cameras/discover",
            "/api/cameras",
            "/api/cameras/{id}",
            "/api/cameras/{id}/validate",
            "/api/cameras/{id}/stream",
            "/api/incidents",
            "/api/incidents/{id}",
            "/api/datasets",
            "/api/datasets/import",
            "/api/models",
            "/api/system/health",
            "/api/notifications",
            "/api/layers/environment",
        ],
    }


if CLIENT_DIST.exists():
    assets_dir = CLIENT_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_client(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (CLIENT_DIST / full_path).resolve()
        if full_path and candidate.is_file() and CLIENT_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(CLIENT_DIST / "index.html")
