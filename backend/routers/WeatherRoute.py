import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
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

# A 7-day forecast with the variables the app asks for is about 30 KB.
MAX_FORECAST_BYTES = 1_000_000


class ForecastBody(BaseModel):
    """A raw Open-Meteo forecast that the phone downloaded itself (see weather.py)."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    forecast: dict


def supplied_forecast(request: Request, body: ForecastBody, lang: Lang) -> dict:
    # Open-Meteo's free limits are per IP address, and this server's address is shared with many
    # other apps. So the app downloads the forecast with the phone's own address and sends it here,
    # and the server still does all the work. The forecast is only used for this one answer:
    # never cached or shown to another device, so a faked one can only fool its sender.
    raw = body.forecast
    try:
        valid = (
            int(request.headers.get("content-length") or 0) <= MAX_FORECAST_BYTES
            and all(isinstance(raw.get(part), dict) for part in ("current", "hourly", "daily"))
            and isinstance(raw["hourly"].get("time"), list)
            and len(raw["hourly"]["time"]) <= 400
            and isinstance(raw["daily"].get("time"), list)
            # The forecast must be for the location it is sent with.
            and abs(float(raw.get("latitude")) - body.latitude) < 0.5
            and abs(float(raw.get("longitude")) - body.longitude) < 0.5
        )
    except (TypeError, ValueError):
        valid = False
    if not valid:
        raise HTTPException(status_code=422, detail=t(lang, "err_forecast_invalid"))
    return raw


async def weather_response(raw: dict, lat: float, lon: float, lang: Lang) -> dict:
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


@router.get("/weather")
async def get_weather(lat: float = Lat, lon: float = Lon, lang: Lang = Depends(get_lang)):
    """Current weather, 48-hour and 7-day forecast (Open-Meteo, fetched by this server)."""
    try:
        raw = await weather.fetch_raw_forecast(lat, lon)
    except Exception as e:
        logger.error(f"Weather provider error: {e}")
        raise HTTPException(status_code=503, detail=t(lang, "err_weather"))
    return await weather_response(raw, lat, lon, lang)


@router.post("/weather")
async def post_weather(request: Request, body: ForecastBody, lang: Lang = Depends(get_lang)):
    """Same as GET /weather, from a forecast the app downloaded from Open-Meteo itself."""
    raw = supplied_forecast(request, body, lang)
    try:
        return await weather_response(raw, body.latitude, body.longitude, lang)
    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail=t(lang, "err_forecast_invalid"))


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
    return await alerts_response(db, lat, lon, lang)


@router.post("/alerts", response_model=AlertListResponse)
async def post_alerts(
    request: Request, body: ForecastBody, db: AsyncSession = Depends(get_db), lang: Lang = Depends(get_lang)
):
    """Same as GET /alerts, from a forecast the app downloaded from Open-Meteo itself."""
    raw = supplied_forecast(request, body, lang)
    try:
        return await alerts_response(db, body.latitude, body.longitude, lang, raw)
    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail=t(lang, "err_forecast_invalid"))


async def alerts_response(db: AsyncSession, lat: float, lon: float, lang: Lang, raw: dict | None = None):
    try:
        items = await alerts.build_alerts(db, lat, lon, lang, raw=raw)
    except alerts.AlertsUnavailable:
        raise HTTPException(status_code=503, detail=t(lang, "err_alerts"))
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
