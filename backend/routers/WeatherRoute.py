import logging
import math
from typing import Optional
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

# A 7-day forecast with the variables the app asks for is about 30 KB; the river data about 2 KB.
MAX_FORECAST_BYTES = 1_000_000
MAX_FLOOD_BYTES = 100_000
RIVER_SERIES = ("river_discharge", "river_discharge_p25", "river_discharge_p75")


class RiverCell(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    median_discharge: float = Field(ge=0)


class FloodData(BaseModel):
    """GloFAS data the phone downloaded itself (mobile/services/glofas.ts, see flood.py).
    `cell` null: the phone found no river nearby."""

    cell: Optional[RiverCell] = None
    forecast: dict = Field(default_factory=dict)
    # Largest flow of each of the past ~20 years, from which the flood levels are computed.
    annual_maxima: list[float] = Field(default_factory=list, max_length=40)


class ForecastBody(BaseModel):
    """A raw Open-Meteo forecast that the phone downloaded itself (see weather.py)."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    forecast: dict
    flood: Optional[FloodData] = None


class FloodBody(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    flood: FloodData


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


def _flows(values) -> bool:
    return isinstance(values, list) and all(
        v is None or (isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v >= 0)
        for v in values
    )


def supplied_flood(data: FloodData, lat: float, lon: float, lang: Lang) -> dict:
    """The phone's GloFAS data, checked, in the shape flood.get_flood_outlook reads. Like the
    forecast, it is only used for this one answer."""
    if data.cell is None:
        return {"cell": None, "forecast": {}, "annual_maxima": []}
    daily, times = data.forecast, data.forecast.get("time")
    valid = (
        # The river cell is one of the 7x7 grid around the location it is sent with.
        abs(data.cell.latitude - lat) < 0.5
        and abs(data.cell.longitude - lon) < 0.5
        and isinstance(times, list)
        and 0 < len(times) <= 25
        and all(isinstance(day, str) and len(day) == 10 for day in times)
        and all(_flows(daily.get(name)) and len(daily[name]) == len(times) for name in RIVER_SERIES)
        and _flows(data.annual_maxima)
    )
    if not valid:
        raise HTTPException(status_code=422, detail=t(lang, "err_flood_invalid"))
    cell = data.cell.model_dump()
    # Open-Meteo gives cells 6 decimals. Rounding undoes any float noise from the phone's JSON, so
    # the alert id is the same whoever downloaded the data, and a warning is notified only once.
    cell["latitude"], cell["longitude"] = round(cell["latitude"], 6), round(cell["longitude"], 6)
    return {
        "cell": cell,
        "forecast": {"time": times, **{name: daily[name] for name in RIVER_SERIES}},
        "annual_maxima": list(data.annual_maxima),
    }


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


@router.post("/flood")
async def post_flood(
    request: Request, body: FloodBody, db: AsyncSession = Depends(get_db), lang: Lang = Depends(get_lang)
):
    """Same as GET /flood, from GloFAS data the app downloaded from Open-Meteo itself."""
    if int(request.headers.get("content-length") or 0) > MAX_FLOOD_BYTES:
        raise HTTPException(status_code=422, detail=t(lang, "err_flood_invalid"))
    supplied = supplied_flood(body.flood, body.latitude, body.longitude, lang)
    return await flood.get_flood_outlook(db, body.latitude, body.longitude, lang, supplied=supplied)


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
    """Same as GET /alerts, from a forecast (and river data) the app downloaded itself."""
    raw = supplied_forecast(request, body, lang)
    river = supplied_flood(body.flood, body.latitude, body.longitude, lang) if body.flood else None
    try:
        return await alerts_response(db, body.latitude, body.longitude, lang, raw, river)
    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(status_code=422, detail=t(lang, "err_forecast_invalid"))


async def alerts_response(
    db: AsyncSession, lat: float, lon: float, lang: Lang, raw: dict | None = None, river: dict | None = None
):
    try:
        items = await alerts.build_alerts(db, lat, lon, lang, raw=raw, river=river)
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
