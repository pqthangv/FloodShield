"""River flood forecast from the Open-Meteo Flood API (GloFAS v4, ~5 km grid, daily).

How the risk is computed:
1. Look at a 7x7 grid of GloFAS cells (about +-16 km) around the user and pick the cell with
   the largest typical discharge - the main river that can flood the area.
2. Build flood thresholds for that cell from 20 years of history: fit a Gumbel distribution
   to the annual maximum discharge and derive the 2-, 5- and 20-year return-period levels
   (the same approach GloFAS uses for its own flood alerts). They are stored in the database.
3. Compare the forecast for the next 10 days with those thresholds.
"""

import asyncio
import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from i18n import Lang, short_date, t
from models.river_model import RiverThreshold
from services.cache import cache
from services.geo import haversine_km, snap
from services.http import get_client

FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
GRID_STEP = 0.05
GRID_RADIUS = 3  # cells in each direction -> 7x7 grid
# The river search is cached on a coarser grid for a month: rivers do not move, and every grid
# point counts as one call against Open-Meteo's free quota (10,000/day).
SEARCH_SNAP = 0.1
MIN_RIVER_DISCHARGE = 5.0  # m3/s; below this there is no meaningful river nearby
# The chart shows GloFAS's 16-day forecast, but only the first 10 days decide the risk: river
# forecasts get less reliable further ahead. The texts don't mention the number, to keep the
# screen simple (the app is meant for everyone, including the elderly).
FORECAST_WINDOW_DAYS = 10
# Open-Meteo bills one call per 14 days of data, so 20 years of history costs ~520 calls.
# Limit how many new rivers we analyse per day to stay inside the free quota.
HISTORY_YEARS = 20
MAX_NEW_THRESHOLDS_PER_DAY = 10

logger = logging.getLogger(__name__)
_budget = {"day": None, "used": 0}
_threshold_locks: dict[str, asyncio.Lock] = {}

# Return period (years) of the flood level each risk level exceeds.
_RISK_YEARS = {"moderate": 2, "high": 5, "severe": 20}


def gumbel_thresholds(annual_maxima: list[float]) -> Optional[dict]:
    """Return-period discharge levels from a Gumbel fit (method of moments)."""
    n = len(annual_maxima)
    if n < 10:
        return None
    mean = sum(annual_maxima) / n
    std = math.sqrt(sum((x - mean) ** 2 for x in annual_maxima) / (n - 1))
    if std <= 0:
        return None
    alpha = std * math.sqrt(6) / math.pi
    mu = mean - 0.5772 * alpha

    def level(t: float) -> float:
        return round(mu - alpha * math.log(-math.log(1 - 1 / t)), 1)

    return {"rp2": level(2), "rp5": level(5), "rp20": level(20), "years": n}


def annual_maxima(times: list[str], values: list) -> list[float]:
    by_year: dict[str, list[float]] = {}
    for t, v in zip(times, values):
        if v is not None:
            by_year.setdefault(t[:4], []).append(v)
    # Only keep years with nearly complete data, otherwise the maximum is unreliable.
    return [max(v) for v in by_year.values() if len(v) >= 300]


def classify(peak: Optional[float], peak_upper: Optional[float], thresholds: Optional[dict]) -> str:
    if peak is None or not thresholds:
        return "unknown"
    if peak >= thresholds["rp20"]:
        return "severe"
    if peak >= thresholds["rp5"]:
        return "high"
    if peak >= thresholds["rp2"]:
        return "moderate"
    if peak_upper is not None and peak_upper >= thresholds["rp2"]:
        return "watch"
    return "none"


async def _find_river_cell(lat: float, lon: float) -> Optional[dict]:
    lat_s, lon_s = snap(lat, SEARCH_SNAP), snap(lon, SEARCH_SNAP)

    async def load():
        lats, lons = [], []
        for i in range(-GRID_RADIUS, GRID_RADIUS + 1):
            for j in range(-GRID_RADIUS, GRID_RADIUS + 1):
                lats.append(round(lat_s + i * GRID_STEP, 3))
                lons.append(round(lon_s + j * GRID_STEP, 3))
        resp = await get_client().get(
            FLOOD_URL,
            params={
                "latitude": ",".join(map(str, lats)),
                "longitude": ",".join(map(str, lons)),
                "daily": "river_discharge_median",
                "forecast_days": 1,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            data = [data]
        cells = []
        for cell in data:
            values = cell.get("daily", {}).get("river_discharge_median") or []
            if values and values[0] is not None:
                cells.append(
                    {"latitude": cell["latitude"], "longitude": cell["longitude"], "median_discharge": values[0]}
                )
        if not cells:
            return {}  # cache "no river" too
        # Downstream cells of the main river carry slightly more water; among the cells on the
        # main river (>= half of the largest flow) take the one closest to the user.
        largest = max(c["median_discharge"] for c in cells)
        main_river = [c for c in cells if c["median_discharge"] >= 0.5 * largest]
        return min(main_river, key=lambda c: haversine_km(lat_s, lon_s, c["latitude"], c["longitude"]))

    cell = await cache.get_or_set(f"flood-cell:{lat_s}:{lon_s}", 30 * 24 * 3600, load)
    if not cell or cell["median_discharge"] < MIN_RIVER_DISCHARGE:
        return None
    return cell


def _threshold_dict(row: RiverThreshold) -> Optional[dict]:
    if row.rp2 is None:
        return None
    return {"rp2": row.rp2, "rp5": row.rp5, "rp20": row.rp20, "years": row.years, "mean": row.mean}


def _take_budget() -> bool:
    today = date.today()
    if _budget["day"] != today:
        _budget["day"], _budget["used"] = today, 0
    if _budget["used"] >= MAX_NEW_THRESHOLDS_PER_DAY:
        return False
    _budget["used"] += 1
    return True


async def _compute_thresholds(cell_lat: float, cell_lon: float) -> dict:
    last_year = date.today().year - 1
    resp = await get_client().get(
        FLOOD_URL,
        params={
            "latitude": cell_lat,
            "longitude": cell_lon,
            "daily": "river_discharge",
            "start_date": f"{last_year - HISTORY_YEARS + 1}-01-01",
            "end_date": f"{last_year}-12-31",
        },
        timeout=60,
    )
    resp.raise_for_status()
    daily = resp.json().get("daily", {})
    values = daily.get("river_discharge", [])
    result = gumbel_thresholds(annual_maxima(daily.get("time", []), values)) or {}
    known = [v for v in values if v is not None]
    if known:
        result["mean"] = round(sum(known) / len(known), 1)
    return result


async def _thresholds(db: AsyncSession, cell_lat: float, cell_lon: float) -> Optional[dict]:
    key = f"flood-thr:{cell_lat}:{cell_lon}"
    cached = cache.get(key)
    if cached is not None:
        return cached or None
    # One computation per river at a time; concurrent requests wait and reuse the result.
    async with _threshold_locks.setdefault(key, asyncio.Lock()):
        cached = cache.get(key)
        if cached is not None:
            return cached or None
        return await _load_or_compute_thresholds(db, key, cell_lat, cell_lon)


async def _load_or_compute_thresholds(
    db: AsyncSession, key: str, cell_lat: float, cell_lon: float
) -> Optional[dict]:
    row = await db.scalar(
        select(RiverThreshold).where(
            RiverThreshold.latitude == cell_lat, RiverThreshold.longitude == cell_lon
        )
    )
    computed_at = row.computed_at if row else None
    if computed_at is not None and computed_at.tzinfo is None:
        computed_at = computed_at.replace(tzinfo=timezone.utc)
    fresh = computed_at is not None and datetime.now(timezone.utc) - computed_at < timedelta(days=365)
    if row and fresh:
        result = _threshold_dict(row) or {}
        cache.set(key, result, 24 * 3600)
        return result or None

    if not _take_budget():
        logger.info("Daily flood-threshold budget used up; risk will be 'unknown' for new rivers")
        return _threshold_dict(row) if row else None

    try:
        result = await _compute_thresholds(cell_lat, cell_lon)
    except Exception as e:
        logger.warning(f"Could not compute flood thresholds: {e}")
        return _threshold_dict(row) if row else None

    if row is None:
        row = RiverThreshold(latitude=cell_lat, longitude=cell_lon)
        db.add(row)
    row.rp2, row.rp5, row.rp20 = result.get("rp2"), result.get("rp5"), result.get("rp20")
    row.mean, row.years = result.get("mean"), result.get("years", 0)
    row.computed_at = datetime.now(timezone.utc)
    await db.commit()
    cache.set(key, result if result.get("rp2") is not None else {}, 24 * 3600)
    return result if result.get("rp2") is not None else None


async def _forecast(cell_lat: float, cell_lon: float) -> dict:
    async def load():
        resp = await get_client().get(
            FLOOD_URL,
            params={
                "latitude": cell_lat,
                "longitude": cell_lon,
                "daily": "river_discharge,river_discharge_p25,river_discharge_p75",
                "past_days": 3,
                "forecast_days": 16,
            },
        )
        resp.raise_for_status()
        return resp.json().get("daily", {})

    return await cache.get_or_set(f"flood-fc:{cell_lat}:{cell_lon}", 3 * 3600, load)


async def get_flood_outlook(db: AsyncSession, lat: float, lon: float, lang: Lang = "vi") -> dict:
    cell = await _find_river_cell(lat, lon)
    if not cell:
        return {
            "river": None,
            "thresholds": None,
            "forecast": [],
            "peak": None,
            "risk": "unknown",
            "risk_label": t(lang, "risk_unknown"),
            "summary": t(lang, "flood_no_river"),
        }

    c_lat, c_lon = cell["latitude"], cell["longitude"]
    daily = await _forecast(c_lat, c_lon)
    thresholds = await _thresholds(db, c_lat, c_lon)

    today = datetime.now(timezone.utc).date().isoformat()
    forecast = []
    for i, day in enumerate(daily.get("time", [])):
        forecast.append(
            {
                "date": day,
                "discharge": daily["river_discharge"][i],
                "discharge_low": daily["river_discharge_p25"][i],
                "discharge_high": daily["river_discharge_p75"][i],
                "is_forecast": day >= today,
            }
        )

    window = [f for f in forecast if f["is_forecast"]][:FORECAST_WINDOW_DAYS]
    peak = max(
        (f for f in window if f["discharge"] is not None),
        key=lambda f: f["discharge"],
        default=None,
    )
    peak_upper = max((f["discharge_high"] for f in window if f["discharge_high"] is not None), default=None)
    risk = classify(peak["discharge"] if peak else None, peak_upper, thresholds)

    distance = round(haversine_km(lat, lon, c_lat, c_lon), 1)
    if risk == "unknown":
        summary = t(lang, "flood_no_history")
    elif risk == "none":
        summary = t(lang, "flood_normal")
    elif risk == "watch":
        summary = t(lang, "flood_watch")
    else:
        summary = t(
            lang,
            "flood_exceeds",
            flow=f"{peak['discharge']:,.0f}",
            date=short_date(peak["date"], lang),
            years=_RISK_YEARS[risk],
        )

    return {
        "river": {
            "latitude": c_lat,
            "longitude": c_lon,
            "distance_km": distance,
            "median_discharge": cell["median_discharge"],
        },
        "thresholds": thresholds,
        "forecast": forecast,
        "peak": {"date": peak["date"], "discharge": peak["discharge"]} if peak else None,
        "risk": risk,
        "risk_label": t(lang, f"risk_{risk}"),
        "summary": summary,
    }
