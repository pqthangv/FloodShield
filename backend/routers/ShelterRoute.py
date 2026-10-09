import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from i18n import Lang, get_lang, t
from models.shelter_model import Shelter, ShelterListResponse
from services import osm
from services.geo import bounding_box, haversine_km

logger = logging.getLogger(__name__)
router = APIRouter()

# The app keeps only the tags we read, so a 15 km search in a big city is a few hundred KB.
MAX_ELEMENTS = 5000
MAX_BODY_BYTES = 3_000_000


class OverpassBody(BaseModel):
    """Overpass results the app downloaded itself (see mobile/services/overpass.ts)."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_km: float = Field(5, gt=0, le=30)
    elements: list[dict] = Field(max_length=MAX_ELEMENTS)


@router.get("/shelters", response_model=ShelterListResponse)
async def nearby_shelters(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(5, gt=0, le=30),
    db: AsyncSession = Depends(get_db),
    lang: Lang = Depends(get_lang),
):
    """Evacuation places near a location: official ones first, then OpenStreetMap places
    (schools, community centres, ward offices, hospitals...), queried by this server."""
    community = []
    try:
        community = await osm.find_shelters(lat, lon, radius_km, lang)
        # Too few results in rural areas: widen the search once.
        if len(community) < 5 and radius_km < 15:
            community = await osm.find_shelters(lat, lon, 15, lang)
    except Exception as e:
        logger.warning(f"Overpass error: {e}")
    return {"shelters": await with_official(db, lat, lon, radius_km, lang, community)}


@router.post("/shelters", response_model=ShelterListResponse)
async def nearby_shelters_from_app(
    request: Request, body: OverpassBody, db: AsyncSession = Depends(get_db), lang: Lang = Depends(get_lang)
):
    """Same as GET /shelters, from Overpass results the app downloaded with its own internet
    address: Overpass refuses this server's shared one. The app widens the search itself.
    The results are only used for this answer, never cached or shown to another device."""
    if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:
        raise HTTPException(status_code=422, detail=t(lang, "err_places_invalid"))
    try:
        community = await osm.find_shelters(body.latitude, body.longitude, body.radius_km, lang, body.elements)
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail=t(lang, "err_places_invalid"))
    return {"shelters": await with_official(db, body.latitude, body.longitude, body.radius_km, lang, community)}


async def with_official(
    db: AsyncSession, lat: float, lon: float, radius_km: float, lang: Lang, community: list[dict]
) -> list[dict]:
    """Official shelters entered by an administrator first, then the OpenStreetMap places."""
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, max(radius_km, 15))
    rows = (
        await db.execute(
            select(Shelter).where(
                Shelter.latitude.between(min_lat, max_lat),
                Shelter.longitude.between(min_lon, max_lon),
            )
        )
    ).scalars().all()
    official = [
        {
            "id": f"official-{s.id}",
            "name": s.name,
            "address": s.address,
            "kind": s.kind,
            "kind_label": osm.kind_label(s.kind, lang, fallback="kind_official"),
            "latitude": s.latitude,
            "longitude": s.longitude,
            "distance_km": round(haversine_km(lat, lon, s.latitude, s.longitude), 2),
            "capacity": s.capacity,
            "phone": s.phone,
            "note": s.note,
            "official": True,
            "source": t(lang, "source_local_authorities"),
        }
        for s in rows
    ]
    official.sort(key=lambda s: s["distance_km"])
    community.sort(key=lambda s: s["distance_km"])
    return official + community[:100]
