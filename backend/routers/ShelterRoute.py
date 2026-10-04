import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models.shelter_model import Shelter, ShelterListResponse
from services import osm
from services.geo import bounding_box, haversine_km

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/shelters", response_model=ShelterListResponse)
async def nearby_shelters(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(5, gt=0, le=30),
    db: AsyncSession = Depends(get_db),
):
    """Evacuation places near a location: official ones first, then OpenStreetMap places
    (schools, community centres, ward offices, hospitals...)."""
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
            "kind_label": osm.KIND_LABELS.get(s.kind, "Điểm sơ tán"),
            "latitude": s.latitude,
            "longitude": s.longitude,
            "distance_km": round(haversine_km(lat, lon, s.latitude, s.longitude), 2),
            "capacity": s.capacity,
            "phone": s.phone,
            "note": s.note,
            "official": True,
            "source": "Chính quyền địa phương",
        }
        for s in rows
    ]

    community = []
    try:
        community = await osm.find_shelters(lat, lon, radius_km)
        # Too few results in rural areas: widen the search once.
        if len(community) < 5 and radius_km < 15:
            community = await osm.find_shelters(lat, lon, 15)
    except Exception as e:
        logger.warning(f"Overpass error: {e}")

    official.sort(key=lambda s: s["distance_km"])
    community.sort(key=lambda s: s["distance_km"])
    return {"shelters": official + community[:100]}
