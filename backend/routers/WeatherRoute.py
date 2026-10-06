import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from i18n import Lang, get_lang, t
from models.alert_model import AlertListResponse
from services import alerts, flood, osm, weather
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter()

Lat = Query(..., ge=-90, le=90, description="Latitude")
Lon = Query(..., ge=-180, le=180, description="Longitude")


@router.get("/weather")
async def get_weather(lat: float = Lat, lon: float = Lon, lang: Lang = Depends(get_lang)):
    """Current weather, 48-hour and 7-day forecast (Open-Meteo)."""
    try:
        raw = await weather.fetch_raw_forecast(lat, lon)
    except Exception as e:
        logger.error(f"Weather provider error: {e}")
        raise HTTPException(status_code=503, detail=t(lang, "err_weather"))
    data = weather.normalize_forecast(raw, lang=lang)
    place = await osm.reverse_geocode(lat, lon, lang)
    data["location"] = {
        "latitude": lat,
        "longitude": lon,
        "name": place["name"] if place else t(lang, "your_location"),
        "region": place.get("region") if place else None,
        "display": place["display"] if place else None,
    }
    return data


@router.get("/flood")
async def get_flood(
    lat: float = Lat, lon: float = Lon, db: AsyncSession = Depends(get_db), lang: Lang = Depends(get_lang)
):
    """River discharge forecast and flood risk for the main river near a location (GloFAS)."""
    try:
        return await flood.get_flood_outlook(db, lat, lon, lang)
    except Exception as e:
        logger.error(f"Flood provider error: {e}")
        raise HTTPException(status_code=503, detail=t(lang, "err_flood"))


@router.get("/alerts", response_model=AlertListResponse)
async def get_alerts(
    lat: float = Lat, lon: float = Lon, db: AsyncSession = Depends(get_db), lang: Lang = Depends(get_lang)
):
    """All active alerts relevant to a location, most severe first."""
    items = await alerts.build_alerts(db, lat, lon, lang)
    return {"alerts": items, "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


@router.get("/geocode/reverse")
async def reverse_geocode(lat: float = Lat, lon: float = Lon, lang: Lang = Depends(get_lang)):
    place = await osm.reverse_geocode(lat, lon, lang)
    if not place:
        raise HTTPException(status_code=503, detail=t(lang, "err_place"))
    return place


@router.get("/geocode/search")
async def search_places(
    q: str = Query(..., min_length=2, max_length=100), lang: Lang = Depends(get_lang)
):
    try:
        return {"results": await osm.search_places(q, lang)}
    except Exception as e:
        logger.error(f"Geocoding error: {e}")
        raise HTTPException(status_code=503, detail=t(lang, "err_search"))
