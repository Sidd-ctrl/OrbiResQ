from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from ..schemas import LocationCandidate, LocationInfo
from ..services import geo

router = APIRouter(prefix="/api/location", tags=["location"])


@router.get("/current", response_model=LocationInfo)
async def current_location(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
) -> LocationInfo:
    resolved = await geo.reverse_geocode(latitude, longitude)
    return LocationInfo(
        latitude=latitude,
        longitude=longitude,
        locality=resolved.get("locality"),
        city=resolved.get("city"),
        district=resolved.get("district"),
        state=resolved.get("state"),
        country=resolved.get("country"),
        country_code=resolved.get("country_code"),
        postcode=resolved.get("postcode"),
        display_name=resolved.get("display_name"),
        source=resolved.get("source", "unavailable"),
        resolved_at=datetime.now(timezone.utc),
        note=resolved.get("note"),
    )


@router.get("/search", response_model=list[LocationCandidate])
async def search_location(q: str = Query(min_length=2, max_length=120)) -> list[LocationCandidate]:
    try:
        results = await geo.search_locations(q)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Location search unavailable: {exc.__class__.__name__}") from exc
    return [LocationCandidate(**item) for item in results]
