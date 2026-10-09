import io
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image

import main
from services import alerts, gdacs, osm, weather
from services.cache import cache

DEVICE = {"X-Device-Id": "device-aaaa-1111"}
OTHER = {"X-Device-Id": "device-bbbb-2222"}
THIRD = {"X-Device-Id": "device-cccc-3333"}


async def fake_place(lat, lon, lang="vi"):
    return {"name": "Phường Test", "region": "TP Test", "display": "Phường Test, TP Test"}


async def fake_forecast(lat, lon):
    return {
        "timezone": "Asia/Ho_Chi_Minh",
        "elevation": 5,
        "current": {"time": "2026-10-04T10:00", "temperature_2m": 30.2, "weather_code": 63,
                    "relative_humidity_2m": 80, "apparent_temperature": 35, "is_day": 1,
                    "precipitation": 2, "wind_speed_10m": 10, "wind_gusts_10m": 20},
        "hourly": {
            "time": [f"2026-10-04T{h:02d}:00" for h in range(24)],
            "temperature_2m": [28] * 24, "precipitation": [0] * 24, "precipitation_probability": [10] * 24,
            "weather_code": [3] * 24, "wind_speed_10m": [8] * 24, "wind_gusts_10m": [15] * 24,
        },
        "daily": {
            "time": ["2026-10-04", "2026-10-05", "2026-10-06"],
            "weather_code": [63, 65, 3], "temperature_2m_max": [32, 31, 33], "temperature_2m_min": [25, 25, 26],
            "apparent_temperature_max": [36, 35, 37], "precipitation_sum": [20, 130, 5],
            "precipitation_probability_max": [70, 95, 20], "wind_speed_10m_max": [15, 20, 10],
            "wind_gusts_10m_max": [30, 40, 25], "sunrise": ["2026-10-04T05:41"] * 3,
            "sunset": ["2026-10-04T17:42"] * 3,
        },
    }


async def fake_flood(db, lat, lon, lang="vi"):
    return {"risk": "none", "river": None, "thresholds": None, "forecast": [], "peak": None,
            "risk_label": "Bình thường", "summary": ""}


async def fake_events():
    return []


@pytest_asyncio.fixture
async def client(monkeypatch):
    monkeypatch.setattr(osm, "reverse_geocode", fake_place)
    monkeypatch.setattr(weather, "fetch_raw_forecast", fake_forecast)
    monkeypatch.setattr(alerts.flood, "get_flood_outlook", fake_flood)
    monkeypatch.setattr(gdacs, "fetch_events", fake_events)
    cache.clear()
    await main.init_db()
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def jpeg_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (2400, 1200), (40, 120, 200)).save(buf, "JPEG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_health_and_seed(client):
    assert (await client.get("/health")).json() == {"status": "ok"}
    types = (await client.get("/api/v1/thientai/")).json()
    assert [t["id"] for t in types] == [1, 2, 3, 4, 5, 6, 7]
    assert all(len(t["actions"]) == 10 for t in types)


@pytest.mark.asyncio
async def test_weather_is_normalized(client):
    data = (await client.get("/api/v1/weather", params={"lat": 10.77, "lon": 106.7})).json()
    assert data["location"]["name"] == "Phường Test"
    assert data["current"]["condition"] == "Mưa vừa"
    assert data["current"]["icon"] == "rain"
    assert data["hourly"][0]["time"] == "2026-10-04T10:00"
    assert len(data["daily"]) == 3


@pytest.mark.asyncio
async def test_alerts_from_forecast(client):
    data = (await client.get("/api/v1/alerts", params={"lat": 10.77, "lon": 106.7})).json()
    assert [a["id"] for a in data["alerts"]] == ["rain-2026-10-05-high"]
    assert data["alerts"][0]["area"] == "Phường Test, TP Test"


@pytest.mark.asyncio
async def test_manual_alert_requires_admin_and_radius(client):
    body = {"title": "Xả lũ hồ Dầu Tiếng", "description": "Chuẩn bị sơ tán", "category": "flood",
            "severity": "severe", "latitude": 11.3, "longitude": 106.3, "radius_km": 60}
    assert (await client.post("/api/v1/admin/alerts", json=body)).status_code == 401
    r = await client.post("/api/v1/admin/alerts", json=body, headers={"X-Admin-Token": "test-admin"})
    assert r.status_code == 201
    near = (await client.get("/api/v1/alerts", params={"lat": 11.0, "lon": 106.5})).json()["alerts"]
    far = (await client.get("/api/v1/alerts", params={"lat": 21.0, "lon": 105.8})).json()["alerts"]
    assert near[0]["title"] == "Xả lũ hồ Dầu Tiếng" and near[0]["severity"] == "severe"
    assert all(a["source"] != "FloodShield" for a in far)
    await client.delete(f"/api/v1/admin/alerts/{r.json()['id']}", headers={"X-Admin-Token": "test-admin"})


@pytest.mark.asyncio
async def test_post_lifecycle(client):
    form = {"author_name": "An", "description": "Nước ngập tới đầu gối", "latitude": "10.77",
            "longitude": "106.70", "category": "flood", "water_level": "knee"}
    r = await client.post("/api/v1/posts", data=form, headers=DEVICE,
                          files={"image": ("photo.jpg", jpeg_bytes(), "image/jpeg")})
    assert r.status_code == 201, r.text
    post = r.json()
    assert post["is_mine"] and post["address"] == "Phường Test, TP Test"
    assert post["image_url"].startswith("http://test/api/v1/images/")

    # Image is re-encoded and resized
    img = Image.open(io.BytesIO((await client.get(post["image_url"])).content))
    assert max(img.size) == 1600

    # Visible to others nearby, not far away
    nearby = (await client.get("/api/v1/posts", params={"lat": 10.78, "lon": 106.71}, headers=OTHER)).json()["posts"]
    assert [p["id"] for p in nearby] == [post["id"]] and not nearby[0]["is_mine"]
    far = (await client.get("/api/v1/posts", params={"lat": 21.0, "lon": 105.8})).json()["posts"]
    assert far == []

    # Confirm toggles
    c = (await client.post(f"/api/v1/posts/{post['id']}/confirm", headers=OTHER)).json()
    assert c == {"confirm_count": 1, "confirmed_by_me": True}
    c = (await client.post(f"/api/v1/posts/{post['id']}/confirm", headers=OTHER)).json()
    assert c == {"confirm_count": 0, "confirmed_by_me": False}

    # Others cannot delete it
    assert (await client.delete(f"/api/v1/posts/{post['id']}", headers=OTHER)).status_code == 403

    # Three reports hide it
    for headers in (OTHER, THIRD, {"X-Device-Id": "device-dddd-4444"}):
        await client.post(f"/api/v1/posts/{post['id']}/report", json={"reason": "sai"}, headers=headers)
    listed = (await client.get("/api/v1/posts")).json()["posts"]
    assert post["id"] not in [p["id"] for p in listed]

    # The author can delete all their data
    assert (await client.delete("/api/v1/me", headers=DEVICE)).json() == {"deleted_posts": 1}


@pytest.mark.asyncio
async def test_post_validation_and_rate_limit(client):
    base = {"author_name": "Bình", "description": "Đường ngập", "latitude": "10.0", "longitude": "105.0"}
    assert (await client.post("/api/v1/posts", data=base)).status_code == 400  # no device id
    bad = await client.post("/api/v1/posts", data=base, headers=OTHER,
                            files={"image": ("x.jpg", b"not an image", "image/jpeg")})
    assert bad.status_code == 400
    codes = [(await client.post("/api/v1/posts", data=base, headers=OTHER)).status_code for _ in range(6)]
    assert codes == [201] * 5 + [429]
    await client.delete("/api/v1/me", headers=OTHER)


# --- English -------------------------------------------------------------------------------

EN = {"Accept-Language": "en-US,en;q=0.9"}


@pytest.mark.asyncio
async def test_weather_in_english(client):
    data = (await client.get("/api/v1/weather", params={"lat": 10.77, "lon": 106.7}, headers=EN)).json()
    assert data["current"]["condition"] == "Moderate rain"
    assert data["daily"][1]["condition"] == "Heavy rain"


@pytest.mark.asyncio
async def test_alert_in_english_keeps_the_same_id(client):
    params = {"lat": 10.77, "lon": 106.7}
    vi = (await client.get("/api/v1/alerts", params=params)).json()["alerts"][0]
    en = (await client.get("/api/v1/alerts", params=params, headers=EN)).json()["alerts"][0]
    # Same id in both languages, so switching language never re-sends a notification.
    assert vi["id"] == en["id"] == "rain-2026-10-05-high"
    assert vi["title"] == "Mưa rất to - 130 mm/ngày"
    assert en["title"] == "Very heavy rain - 130 mm/day"
    assert en["details"][1] == {"label": "Mon 5 Oct", "value": "130 mm"}


@pytest.mark.asyncio
async def test_disaster_checklists_in_english(client):
    types = (await client.get("/api/v1/thientai/", headers=EN)).json()
    assert [t["name"] for t in types] == [
        "Storm", "Flood", "Wildfire", "Landslide", "Drought", "Heat wave", "Earthquake",
    ]
    flood = (await client.get("/api/v1/thientai/2", headers=EN)).json()
    assert flood["actions"][1]["title"] == "Evacuate in an emergency"
    vi = (await client.get("/api/v1/thientai/2")).json()
    assert vi["name"] == "Lũ" and vi["actions"][1]["title"] == "Sơ tán khẩn cấp"


@pytest.mark.asyncio
async def test_errors_in_english(client):
    form = {"author_name": "An", "description": "Street flooded", "latitude": "10", "longitude": "105"}
    r = await client.post("/api/v1/posts", data=form, headers=EN)
    assert r.status_code == 400 and r.json()["detail"] == "Missing device id (X-Device-Id)"


@pytest.mark.asyncio
async def test_changing_disaster_types_needs_admin(client):
    assert (await client.post("/api/v1/thientai/", json={"name": "Spam"})).status_code == 401
    assert (await client.delete("/api/v1/thientai/1")).status_code == 401


@pytest.mark.asyncio
async def test_admin_adds_a_disaster_type(client):
    # The 7 seeded types have fixed ids; a new one must get the next id (on PostgreSQL too).
    admin = {"X-Admin-Token": "test-admin"}
    r = await client.post("/api/v1/thientai/", json={"name": "Lốc xoáy"}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["id"] == 8 and r.json()["actions"] == []
    assert (await client.delete("/api/v1/thientai/8", headers=admin)).status_code == 200
    assert len((await client.get("/api/v1/thientai/")).json()) == 7
