"""Rain warnings by push notification: registration, the hourly job's endpoints, and sending."""

import json
from datetime import datetime, timedelta, timezone
import httpx
import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
import main
from database import SessionLocal
from models.push_model import PushDevice
from services import push

JOB = {"X-Push-Job-Token": "test-push-job"}
ADMIN = {"X-Admin-Token": "test-admin"}
VI_PHONE = {"X-Device-Id": "push-phone-vi-0001", "Accept-Language": "vi"}
EN_PHONE = {"X-Device-Id": "push-phone-en-0002", "Accept-Language": "en"}
HANOI = (21.03, 105.85)


class FakeSender:
    def __init__(self, platform, sent):
        self.platform, self.sent = platform, sent

    async def send(self, client, token, message):
        if token.startswith("gone-"):
            return "gone"
        self.sent.append((self.platform, token, message))
        return "sent"


@pytest_asyncio.fixture
async def client(monkeypatch):
    await main.init_db()
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
        # Leave no phones behind for the other tests.
        for phone in (VI_PHONE, EN_PHONE):
            await c.delete("/api/v1/push", headers=phone)


@pytest.fixture
def sent(monkeypatch):
    sent = []
    monkeypatch.setattr(push, "get_senders", lambda: {p: FakeSender(p, sent) for p in ("android", "ios")})
    return sent


def forecast(lat, lon, daily_mm=(10, 0, 0), hourly_mm=0.0, now="2026-10-14T10:00", rain_at=None):
    """rain_at: {"15:00": (mm, chance %)} for today's hours; other hours are dry."""
    hours = [f"2026-10-14T{h:02d}:00" for h in range(24)] + [f"2026-10-15T{h:02d}:00" for h in range(24)]
    rain = [hourly_mm] * len(hours)
    chance = [0] * len(hours)
    for at, (mm, pct) in (rain_at or {}).items():
        i = hours.index(f"2026-10-14T{at}")
        rain[i], chance[i] = mm, pct
    return {
        "latitude": lat, "longitude": lon, "utc_offset_seconds": 25200, "elevation": 10,
        "current": {"time": now, "precipitation": 0},
        "hourly": {"time": hours, "precipitation": rain, "precipitation_probability": chance},
        "daily": {"time": ["2026-10-14", "2026-10-15", "2026-10-16"], "precipitation_sum": list(daily_mm)},
    }


async def register(c, phone, token, platform="android", where=HANOI):
    return await c.put("/api/v1/push", headers=phone,
                       json={"token": token, "platform": platform, "latitude": where[0], "longitude": where[1]})


async def run(c, *forecasts):
    r = await c.post("/api/v1/push/job/rain", headers=JOB, json={"forecasts": [
        {"latitude": f["latitude"], "longitude": f["longitude"], "forecast": f} for f in forecasts]})
    assert r.status_code == 200
    return r.json()


@pytest.mark.asyncio
async def test_registration(client):
    body = {"token": "x" * 40, "platform": "android", "latitude": 21.03, "longitude": 105.85}
    assert (await client.put("/api/v1/push", json=body)).status_code == 400  # no device id
    assert (await client.put("/api/v1/push", headers=VI_PHONE, json={**body, "platform": "web"})).status_code == 422
    assert (await register(client, VI_PHONE, "token-vi-" + "a" * 30)).json() == {"ok": True}
    # Registering again (new token, new place) updates the same phone.
    assert (await register(client, VI_PHONE, "token-vi-" + "b" * 30, where=(16.07, 108.2))).status_code == 200
    async with SessionLocal() as db:
        rows = (await db.execute(select(PushDevice).where(PushDevice.device_id == VI_PHONE["X-Device-Id"]))).scalars().all()
    assert [(r.token[-1], r.area_lat, r.area_lon, r.language) for r in rows] == [("b", 161, 1082, "vi")]


@pytest.mark.asyncio
async def test_job_endpoints_need_the_push_job_token(client):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    assert (await client.get("/api/v1/push/job/areas")).status_code == 401
    assert (await client.post("/api/v1/push/job/rain", json={"forecasts": []})).status_code == 401
    # Each token opens only its own endpoints.
    assert (await client.get("/api/v1/push/job/areas", headers=ADMIN)).status_code == 401
    assert (await client.get("/api/v1/admin/alerts", headers=JOB)).status_code == 401
    areas = (await client.get("/api/v1/push/job/areas", headers=JOB)).json()["areas"]
    assert {"latitude": 21.0, "longitude": 105.8} in areas


@pytest.mark.asyncio
async def test_heavy_rain_is_pushed_once_in_each_phones_language(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30, "android")
    await register(client, EN_PHONE, "token-en-" + "a" * 30, "ios")
    rainy = forecast(21.0, 105.8, daily_mm=(120, 10, 0))
    result = await run(client, rainy)
    assert result["sent"] == 2 and result["failed"] == 0
    by_platform = {platform: message for platform, _, message in sent}
    assert by_platform["android"].id == by_platform["ios"].id == "rain-2026-10-14-high"
    assert by_platform["android"].body.endswith("Nguồn: Open-Meteo")
    assert by_platform["ios"].body.endswith("Source: Open-Meteo")
    assert "120 mm" in by_platform["ios"].title
    # The next hour: the same warning isn't sent again.
    assert (await run(client, rainy))["sent"] == 0
    # It gets worse: a new warning.
    assert (await run(client, forecast(21.0, 105.8, daily_mm=(220, 10, 0))))["sent"] == 2


@pytest.mark.asyncio
async def test_no_rain_or_other_areas_send_nothing(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    result = await run(client, forecast(21.0, 105.8, daily_mm=(20, 5, 0)), forecast(10.8, 106.7, daily_mm=(150, 0, 0)))
    assert result["sent"] == 0 and sent == []


@pytest.mark.asyncio
async def test_only_rain_warnings_are_pushed(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    hilly = forecast(21.0, 105.8, daily_mm=(160, 0, 0))
    hilly["elevation"] = 600  # this much rain in the hills also gives a landslide warning
    await run(client, hilly)
    assert [m.id for _, _, m in sent] == ["rain-2026-10-14-high"]


@pytest.mark.asyncio
async def test_short_intense_rain_is_pushed(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    await run(client, forecast(21.0, 105.8, daily_mm=(40, 0, 0), hourly_mm=20))
    assert [m.id.split("-")[0] for _, _, m in sent] == ["urban"]


@pytest.mark.asyncio
async def test_quiet_hours_hold_all_but_severe(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    night = forecast(21.0, 105.8, daily_mm=(120, 0, 0), now="2026-10-14T23:00")
    result = await run(client, night)
    assert result["sent"] == 0 and result["held"] == 1
    # Still forecast in the morning: sent then.
    assert (await run(client, forecast(21.0, 105.8, daily_mm=(120, 0, 0), now="2026-10-14T06:00")))["sent"] == 1
    # Severe goes out at night too.
    assert (await run(client, forecast(21.0, 105.8, daily_mm=(250, 0, 0), now="2026-10-14T02:00")))["sent"] == 1


@pytest.mark.asyncio
async def test_uninstalled_apps_are_forgotten(client, sent):
    await register(client, VI_PHONE, "gone-" + "a" * 30)
    result = await run(client, forecast(21.0, 105.8, daily_mm=(120, 0, 0)))
    assert result["removed"] == 1
    async with SessionLocal() as db:
        assert await db.get(PushDevice, VI_PHONE["X-Device-Id"]) is None


@pytest.mark.asyncio
async def test_bad_forecasts_are_counted_not_used(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    wrong_place = forecast(10.8, 106.7, daily_mm=(150, 0, 0))
    r = await client.post("/api/v1/push/job/rain", headers=JOB, json={"forecasts": [
        {"latitude": 21.0, "longitude": 105.8, "forecast": wrong_place},
        {"latitude": 21.0, "longitude": 105.8, "forecast": {"current": {}}},
    ]})
    assert r.json()["bad_forecasts"] == 2 and sent == []


@pytest.mark.asyncio
async def test_turning_off_and_deleting_data_remove_the_phone(client):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    await register(client, EN_PHONE, "token-en-" + "a" * 30)
    assert (await client.delete("/api/v1/push", headers=VI_PHONE)).json() == {"ok": True}
    assert (await client.delete("/api/v1/me", headers=EN_PHONE)).status_code == 200
    async with SessionLocal() as db:
        left = (await db.execute(select(PushDevice.device_id))).scalars().all()
    assert VI_PHONE["X-Device-Id"] not in left and EN_PHONE["X-Device-Id"] not in left


@pytest.mark.asyncio
async def test_phones_that_stopped_checking_in_are_forgotten(client):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    async with SessionLocal() as db:
        device = await db.get(PushDevice, VI_PHONE["X-Device-Id"])
        device.updated_at = datetime.now(timezone.utc) - timedelta(days=push.STALE_DAYS + 1)
        await db.commit()
    areas = (await client.get("/api/v1/push/job/areas", headers=JOB)).json()["areas"]
    assert {"latitude": 21.0, "longitude": 105.8} not in areas
    async with SessionLocal() as db:
        await push.purge(db)
        assert await db.get(PushDevice, VI_PHONE["X-Device-Id"]) is None



@pytest.mark.asyncio
async def test_morning_rain_reminder(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    await register(client, EN_PHONE, "token-en-" + "a" * 30, "ios")
    light = {"11:00": (1.0, 90), "15:00": (3.0, 80)}
    result = await run(client, forecast(21.0, 105.8, now="2026-10-14T07:00", rain_at=light))
    assert result["sent"] == 2
    messages = {platform: m for platform, _, m in sent}
    assert messages["android"].id == "rain-today-2026-10-14" and messages["android"].kind == "reminder"
    assert messages["android"].title == "Hôm nay có mưa"
    assert messages["android"].body.startswith("Mưa nhiều nhất khoảng 15:00. Nhớ mang ô")
    assert messages["ios"].body == ("Heaviest around 15:00. Remember an umbrella or raincoat when you go out.\n"
                                    "Source: Open-Meteo")
    # Once a day.
    assert (await run(client, forecast(21.0, 105.8, now="2026-10-14T08:00", rain_at=light)))["sent"] == 0


@pytest.mark.asyncio
async def test_reminder_only_in_the_morning_and_for_likely_rain(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    likely = {"15:00": (3.0, 80)}
    for now in ("2026-10-14T05:00", "2026-10-14T10:00", "2026-10-14T13:00"):
        assert (await run(client, forecast(21.0, 105.8, now=now, rain_at=likely)))["sent"] == 0
    for rain in ({"15:00": (1.5, 90)}, {"15:00": (5.0, 50)}, {"22:00": (5.0, 90)}):
        assert (await run(client, forecast(21.0, 105.8, now="2026-10-14T07:00", rain_at=rain)))["sent"] == 0
    assert sent == []


@pytest.mark.asyncio
async def test_no_reminder_on_a_day_with_a_heavy_rain_warning(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    stormy = forecast(21.0, 105.8, daily_mm=(120, 0, 0), now="2026-10-14T07:00", rain_at={"15:00": (9.0, 95)})
    await run(client, stormy)
    assert [m.kind for _, _, m in sent] == ["warning"]


@pytest.mark.asyncio
async def test_reminder_today_and_warning_for_tomorrow(client, sent):
    await register(client, VI_PHONE, "token-vi-" + "a" * 30)
    await run(client, forecast(21.0, 105.8, daily_mm=(10, 120, 0), now="2026-10-14T07:00",
                               rain_at={"15:00": (3.0, 80)}))
    assert sorted(m.id for _, _, m in sent) == ["rain-2026-10-15-high", "rain-today-2026-10-14"]

# --- The real senders, against a fake Google / Apple ---------------------------------------

MESSAGE = push.Message(id="rain-2026-10-14-high", title="Mưa rất to - 120 mm/ngày", body="...\nNguồn: Open-Meteo",
                       severity="high")


def pem(key):
    return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                             serialization.NoEncryption()).decode()


@pytest.mark.asyncio
async def test_fcm_sender():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    account = {"project_id": "floodshield-test", "client_email": "push@floodshield-test.iam.gserviceaccount.com",
               "private_key": pem(key), "private_key_id": "k1", "token_uri": "https://oauth2.googleapis.com/token"}
    seen = []

    def google(request: httpx.Request):
        seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            assertion = dict(x.split("=") for x in request.content.decode().split("&"))["assertion"]
            claims = jwt.decode(assertion, key.public_key(), algorithms=["RS256"], audience=account["token_uri"])
            assert claims["scope"].endswith("firebase.messaging")
            return httpx.Response(200, json={"access_token": "ya29.test", "expires_in": 3600})
        if "dead" in request.content.decode():
            return httpx.Response(404, json={"error": {"status": "NOT_FOUND"}})
        return httpx.Response(200, json={"name": "projects/floodshield-test/messages/1"})

    sender = push.FcmSender(account)
    async with httpx.AsyncClient(transport=httpx.MockTransport(google)) as client:
        assert await sender.send(client, "phone-token", MESSAGE) == "sent"
        assert await sender.send(client, "dead-token", MESSAGE) == "gone"
    sends = [r for r in seen if r.url.host == "fcm.googleapis.com"]
    assert len(seen) - len(sends) == 1  # one login, reused
    assert sends[0].url.path == "/v1/projects/floodshield-test/messages:send"
    assert sends[0].headers["authorization"] == "Bearer ya29.test"
    message = json.loads(sends[0].content)["message"]
    # A data message: the app builds the notification itself, with the alert's id.
    assert "notification" not in message and message["data"]["id"] == MESSAGE.id
    assert message["android"]["priority"] == "HIGH"


@pytest.mark.asyncio
async def test_apns_sender():
    key = ec.generate_private_key(ec.SECP256R1())
    seen = []

    def apple(request: httpx.Request):
        seen.append(request)
        if request.url.path.endswith("/dead"):
            return httpx.Response(410, json={"reason": "Unregistered"})
        return httpx.Response(200)

    sender = push.ApnsSender(pem(key), "KEY123", "TEAM456", "com.floodshield.app", sandbox=False)
    async with httpx.AsyncClient(transport=httpx.MockTransport(apple)) as client:
        assert await sender.send(client, "abc123", MESSAGE) == "sent"
        assert await sender.send(client, "dead", MESSAGE) == "gone"
    request = seen[0]
    assert str(request.url) == "https://api.push.apple.com/3/device/abc123"
    token = request.headers["authorization"].removeprefix("bearer ")
    assert jwt.get_unverified_header(token)["kid"] == "KEY123"
    assert jwt.decode(token, key.public_key(), algorithms=["ES256"])["iss"] == "TEAM456"
    assert request.headers["apns-topic"] == "com.floodshield.app"
    assert request.headers["apns-collapse-id"] == MESSAGE.id
    assert json.loads(request.content)["aps"]["alert"]["title"] == MESSAGE.title
