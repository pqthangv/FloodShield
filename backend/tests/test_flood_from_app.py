"""The app downloads the GloFAS river data itself (mobile/services/glofas.ts) because this
server's shared address runs out of Open-Meteo quota; the server analyses what it sends."""

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select

import main
from database import SessionLocal
from i18n import t
from models.river_model import RiverThreshold
from services import eonet, flood, gdacs, osm
from services.cache import cache

HUE = {"latitude": 16.4637, "longitude": 107.5909}
CELL = {"latitude": 16.475006, "longitude": 107.57501, "median_discharge": 610.0}
MAXIMA = [900, 1200, 1500, 1100, 2400, 1300, 1700, 1000, 2000, 1400,
          1600, 950, 1800, 1250, 2200, 1150, 1350, 1900, 1050, 1450]
LEVELS = flood.gumbel_thresholds(MAXIMA)


def river_forecast(peak: float) -> dict:
    """3 past days and 16 forecast days, with `peak` five days from now."""
    today = datetime.now(timezone.utc).date()
    days = [(today + timedelta(days=i)).isoformat() for i in range(-3, 16)]
    flows = [800.0] * len(days)
    flows[8] = peak
    return {"time": days, "river_discharge": flows,
            "river_discharge_p25": [f * 0.8 for f in flows], "river_discharge_p75": [f * 1.2 for f in flows]}


def weather_forecast() -> dict:
    hours = [f"2026-10-04T{h:02d}:00" for h in range(24)]
    return {
        **HUE, "timezone": "Asia/Ho_Chi_Minh", "elevation": 5,
        "current": {"time": hours[10], "temperature_2m": 28, "weather_code": 3, "relative_humidity_2m": 80,
                    "apparent_temperature": 30, "is_day": 1, "precipitation": 0, "wind_speed_10m": 5,
                    "wind_gusts_10m": 10},
        "hourly": {"time": hours, "temperature_2m": [28] * 24, "precipitation": [0] * 24,
                   "precipitation_probability": [10] * 24, "weather_code": [3] * 24,
                   "wind_speed_10m": [5] * 24, "wind_gusts_10m": [10] * 24},
        "daily": {"time": ["2026-10-04"], "weather_code": [3], "temperature_2m_max": [31],
                  "temperature_2m_min": [25], "apparent_temperature_max": [33], "precipitation_sum": [1],
                  "precipitation_probability_max": [20], "wind_speed_10m_max": [10], "wind_gusts_10m_max": [20],
                  "sunrise": ["2026-10-04T05:41"], "sunset": ["2026-10-04T17:42"]},
    }


async def no_downloads(*args, **kwargs):
    raise AssertionError("the server must not download river data the app sent")


async def place(lat, lon, lang="vi"):
    return {"name": "Thuận Hóa", "region": "Huế", "display": "Thuận Hóa, Huế"}


async def no_events():
    return []


@pytest_asyncio.fixture
async def client(monkeypatch):
    for name in ("_find_river_cell", "_forecast", "_compute_thresholds"):
        monkeypatch.setattr(flood, name, no_downloads)
    monkeypatch.setattr(osm, "reverse_geocode", place)
    monkeypatch.setattr(gdacs, "fetch_events", no_events)
    monkeypatch.setattr(eonet, "fetch_storms", no_events)
    cache.clear()
    await main.init_db()
    async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as c:
        yield c


async def stored_levels() -> int:
    async with SessionLocal() as db:
        return await db.scalar(select(func.count(RiverThreshold.id)))


@pytest.mark.asyncio
async def test_flood_risk_from_the_phones_data(client):
    before = await stored_levels()
    flood_data = {"cell": CELL, "forecast": river_forecast((LEVELS["rp5"] + LEVELS["rp20"]) / 2),
                  "annual_maxima": MAXIMA}
    data = (await client.post("/api/v1/flood", json={**HUE, "flood": flood_data})).json()
    assert data["risk"] == "high"
    assert data["thresholds"] == LEVELS
    assert data["river"]["latitude"] == CELL["latitude"] and len(data["forecast"]) == 19
    # Used for this answer only: nothing the phone sent is kept.
    assert await stored_levels() == before


@pytest.mark.asyncio
async def test_no_river_near_the_phone(client):
    data = (await client.post("/api/v1/flood", json={**HUE, "flood": {"cell": None}})).json()
    assert data["river"] is None and data["risk"] == "unknown"
    assert data["summary"] == t("vi", "flood_no_river")


@pytest.mark.asyncio
async def test_flood_levels_the_server_computed_win(client):
    cell = {**CELL, "latitude": 16.525006}
    async with SessionLocal() as db:
        db.add(RiverThreshold(latitude=cell["latitude"], longitude=cell["longitude"],
                              rp2=50_000, rp5=60_000, rp20=70_000, mean=900, years=20))
        await db.commit()
    try:
        flood_data = {"cell": cell, "forecast": river_forecast(LEVELS["rp20"] + 100), "annual_maxima": MAXIMA}
        data = (await client.post("/api/v1/flood", json={**HUE, "flood": flood_data})).json()
        assert data["thresholds"]["rp2"] == 50_000 and data["risk"] == "none"
    finally:
        async with SessionLocal() as db:
            await db.execute(delete(RiverThreshold).where(RiverThreshold.latitude == cell["latitude"]))
            await db.commit()


@pytest.mark.asyncio
async def test_bad_river_data_is_refused(client):
    good = {"cell": CELL, "forecast": river_forecast(1000), "annual_maxima": MAXIMA}
    short = river_forecast(1000)
    short["river_discharge_p25"] = short["river_discharge_p25"][:-1]
    long = {name: values * 2 for name, values in river_forecast(1000).items()}
    for bad in (
        {**good, "cell": {**CELL, "latitude": CELL["latitude"] + 1}},  # not near the location
        {**good, "forecast": short},
        {**good, "forecast": long},
        {**good, "annual_maxima": [-5.0] * 20},
        {**good, "forecast": {**river_forecast(1000), "river_discharge": ["a lot"] * 19}},
    ):
        r = await client.post("/api/v1/flood", json={**HUE, "flood": bad})
        assert r.status_code == 422
        assert r.json()["detail"] == t("vi", "err_flood_invalid")


@pytest.mark.asyncio
async def test_alerts_warn_of_the_river_flood_from_the_phones_data(client):
    # The phone's JSON may add float noise to the cell; the alert id must not change (one notification).
    noisy = {**CELL, "latitude": CELL["latitude"] + 1e-12}
    flood_data = {"cell": noisy, "forecast": river_forecast((LEVELS["rp5"] + LEVELS["rp20"]) / 2),
                  "annual_maxima": MAXIMA}
    body = {**HUE, "forecast": weather_forecast(), "flood": flood_data}
    items = (await client.post("/api/v1/alerts", json=body)).json()["alerts"]
    river = [a for a in items if a["id"].startswith("flood-")]
    assert len(river) == 1 and river[0]["severity"] == "high"
    assert river[0]["id"].startswith(f"flood-{CELL['latitude']}-{CELL['longitude']}-high-")


@pytest.mark.asyncio
async def test_alerts_from_an_older_app_without_river_data(client):
    # The server tries to download the river data itself; when it can't, the other alerts still come.
    r = await client.post("/api/v1/alerts", json={**HUE, "forecast": weather_forecast()})
    assert r.status_code == 200
    assert not [a for a in r.json()["alerts"] if a["id"].startswith("flood-")]
