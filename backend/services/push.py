"""Rain warnings as push notifications: Firebase Cloud Messaging on Android, Apple's APNs on iPhone.

This server can't download forecasts itself (Open-Meteo's free limit is per IP address, and
Render's address is shared), so an hourly job (scripts/rain_push.py) downloads the forecast of
every area that has phones registered and posts it to /push/job/rain. The same rain rules as
in the app turn it into warnings, and each new one is sent once to each phone in the area.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, Protocol
import httpx
import jwt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from config import settings
from i18n import Lang, t
from models.push_model import PushDevice, PushSent
from services import alerts

logger = logging.getLogger(__name__)

PUSHED_CATEGORIES = {"heavy_rain", "urban_flood"}
PUSHED_SEVERITIES = {"moderate", "high", "severe"}
# Moderate and high warnings wait for the morning (local time); severe ones go out at any hour.
QUIET_FROM, QUIET_UNTIL = 22, 6
# The morning rain reminder ("take an umbrella"): sent by the first run between these hours, if
# some hour between REMINDER_RAIN_FROM and REMINDER_RAIN_UNTIL today brings this much rain at this
# chance or more.
REMINDER_FROM, REMINDER_UNTIL = 6, 10
REMINDER_RAIN_FROM, REMINDER_RAIN_UNTIL = 6, 21
REMINDER_MM, REMINDER_CHANCE = 2.0, 60
# Phones that haven't checked in for this long are forgotten.
STALE_DAYS = 60
SENT_KEEP_DAYS = 14
# A warning that couldn't be delivered within this time isn't worth showing any more.
TTL_SECONDS = 6 * 3600
CONCURRENT_SENDS = 10

Result = Literal["sent", "gone", "failed"]


def area_of(lat: float, lon: float) -> tuple[int, int]:
    """The ~10 km area of a location, in tenths of a degree."""
    return round(lat * 10), round(lon * 10)


@dataclass
class Message:
    id: str
    title: str
    body: str
    severity: str
    # "warning", or "reminder" for the morning rain reminder (a quieter notification channel).
    kind: str = "warning"
    # The day it is about ("2026-10-14").
    day: str = ""


def rain_warnings(raw: dict, lang: Lang) -> list[Message]:
    found = alerts.rain_alerts(raw, "", lang)
    intense = alerts.intense_rain_alert(raw, "", lang)
    if intense:
        found.append(intense)
    return [
        Message(
            id=a["id"],
            title=a["title"],
            body=f'{a["description"]}\n{t(lang, "push_source", source=a["source"])}',
            severity=a["severity"],
            day=(a.get("starts_at") or "")[:10],
        )
        for a in found
        if a["category"] in PUSHED_CATEGORIES and a["severity"] in PUSHED_SEVERITIES
    ]


def rain_reminder(raw: dict, lang: Lang) -> Optional[Message]:
    """'Rain today, take an umbrella': sent in the morning when rain below the warning level is
    likely during the day."""
    now = raw["current"]["time"]
    today, hour = now[:10], int(now[11:13])
    if not REMINDER_FROM <= hour < REMINDER_UNTIL:
        return None
    hourly = raw.get("hourly", {})
    times = hourly.get("time", [])
    rain = hourly.get("precipitation", [])
    chance = hourly.get("precipitation_probability", [])
    likely = [
        (mm or 0, time)
        for time, mm, pct in zip(times, rain, chance)
        if time[:10] == today and max(hour, REMINDER_RAIN_FROM) <= int(time[11:13]) < REMINDER_RAIN_UNTIL
        and (mm or 0) >= REMINDER_MM and (pct or 0) >= REMINDER_CHANCE
    ]
    if not likely:
        return None
    heaviest = max(likely)[1]
    return Message(
        id=f"rain-today-{today}",
        title=t(lang, "reminder_title"),
        body=f'{t(lang, "reminder_desc", time=heaviest[11:16])}\n{t(lang, "push_source", source="Open-Meteo")}',
        severity="info",
        kind="reminder",
        day=today,
    )


def pushes_for(raw: dict, lang: Lang) -> list[Message]:
    """The warnings, and the morning reminder unless a warning already covers today."""
    found = rain_warnings(raw, lang)
    reminder = rain_reminder(raw, lang)
    if reminder and not any(m.day == reminder.day for m in found):
        found.append(reminder)
    return found


def is_quiet(raw: dict) -> bool:
    """Night where the forecast is for: Open-Meteo gives the current local time there."""
    hour = int(raw["current"]["time"][11:13])
    return hour >= QUIET_FROM or hour < QUIET_UNTIL


class Sender(Protocol):
    async def send(self, client: httpx.AsyncClient, token: str, message: Message) -> Result: ...


class FcmSender:
    """Firebase Cloud Messaging, HTTP v1 API. Sends data messages: the app shows the notification
    itself, with the same id as its own background check, so a warning never shows twice."""

    SCOPE = "https://www.googleapis.com/auth/firebase.messaging"

    def __init__(self, account: dict):
        self.account = account
        self.token_url = account.get("token_uri") or "https://oauth2.googleapis.com/token"
        self.url = f"https://fcm.googleapis.com/v1/projects/{account['project_id']}/messages:send"
        self._access: Optional[str] = None
        self._expires = 0.0

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        if self._access and time.time() < self._expires - 60:
            return self._access
        now = int(time.time())
        assertion = jwt.encode(
            {"iss": self.account["client_email"], "scope": self.SCOPE, "aud": self.token_url,
             "iat": now, "exp": now + 3600},
            self.account["private_key"],
            algorithm="RS256",
            headers={"kid": self.account.get("private_key_id", "")},
        )
        r = await client.post(
            self.token_url,
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
        )
        r.raise_for_status()
        data = r.json()
        self._access = data["access_token"]
        self._expires = time.time() + float(data.get("expires_in", 3600))
        return self._access

    async def send(self, client: httpx.AsyncClient, token: str, message: Message) -> Result:
        r = await client.post(
            self.url,
            headers={"Authorization": f"Bearer {await self._access_token(client)}"},
            json={
                "message": {
                    "token": token,
                    "data": {"id": message.id, "title": message.title, "body": message.body,
                             "severity": message.severity, "kind": message.kind},
                    "android": {"priority": "HIGH", "ttl": f"{TTL_SECONDS}s"},
                }
            },
        )
        if r.status_code == 200:
            return "sent"
        # The app was uninstalled, or Firebase gave it a new token.
        if r.status_code == 404 or (r.status_code == 400 and "registration token" in r.text):
            return "gone"
        logger.warning("FCM %s: %s", r.status_code, r.text[:300])
        return "failed"


class ApnsSender:
    """Apple Push Notification service, with a token-based (.p8) key."""

    def __init__(self, key: str, key_id: str, team_id: str, topic: str, sandbox: bool):
        self.key, self.key_id, self.team_id, self.topic = key, key_id, team_id, topic
        self.host = "https://api.sandbox.push.apple.com" if sandbox else "https://api.push.apple.com"
        self._jwt: Optional[str] = None
        self._made = 0.0

    def _auth(self) -> str:
        # Apple refuses tokens older than an hour, and too many new ones: make one every 50 minutes.
        if not self._jwt or time.time() - self._made > 50 * 60:
            self._made = time.time()
            self._jwt = jwt.encode({"iss": self.team_id, "iat": int(self._made)}, self.key,
                                   algorithm="ES256", headers={"kid": self.key_id})
        return self._jwt

    async def send(self, client: httpx.AsyncClient, token: str, message: Message) -> Result:
        r = await client.post(
            f"{self.host}/3/device/{token}",
            headers={
                "authorization": f"bearer {self._auth()}",
                "apns-topic": self.topic,
                "apns-push-type": "alert",
                # A reminder isn't urgent: Apple may then wait a little to save battery.
                "apns-priority": "5" if message.kind == "reminder" else "10",
                "apns-expiration": str(int(time.time()) + TTL_SECONDS),
                # The id the app's own notification for this warning uses (FSAlertScheduler.mm).
                "apns-collapse-id": message.id[:64],
            },
            json={"aps": {"alert": {"title": message.title, "body": message.body}, "sound": "default",
                          # Reminders and warnings are grouped apart in the notification list.
                          "thread-id": message.kind},
                  "id": message.id},
        )
        if r.status_code == 200:
            return "sent"
        try:
            reason = r.json().get("reason", "")
        except ValueError:
            reason = ""
        if r.status_code == 410 or reason in ("BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"):
            return "gone"
        logger.warning("APNs %s: %s", r.status_code, reason or r.text[:300])
        return "failed"


_senders: Optional[dict[str, Sender]] = None
_client: Optional[httpx.AsyncClient] = None


def get_senders() -> dict[str, Sender]:
    """The senders that have settings, by platform."""
    global _senders
    if _senders is None:
        _senders = {}
        try:
            if settings.fcm_service_account:
                _senders["android"] = FcmSender(json.loads(settings.fcm_service_account))
            if settings.apns_key and settings.apns_key_id and settings.apple_team_id:
                # Some hosts can't store line breaks in a setting: "\n" works too.
                key = settings.apns_key.replace("\\n", "\n")
                _senders["ios"] = ApnsSender(key, settings.apns_key_id, settings.apple_team_id,
                                             settings.apns_topic, settings.apns_sandbox)
        except (ValueError, KeyError) as e:
            logger.error(f"Push settings are not valid: {e}")
    return _senders


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        # Apple's push service only accepts HTTP/2.
        _client = httpx.AsyncClient(http2=True, timeout=httpx.Timeout(20.0, connect=10.0))
    return _client


async def close_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def send_rain_warnings(db: AsyncSession, forecasts: list[tuple[float, float, dict]]) -> dict:
    """Sends the new rain warnings of each area's forecast to the phones in that area."""
    counts = {"areas": 0, "phones": 0, "sent": 0, "held": 0, "failed": 0, "removed": 0,
              "not_configured": 0, "bad_forecasts": 0}
    senders = get_senders()
    fresh = datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)
    jobs: list[tuple[PushDevice, Message]] = []
    done_areas = set()
    for lat, lon, raw in forecasts:
        area = area_of(lat, lon)
        if area in done_areas:
            continue
        done_areas.add(area)
        devices = (
            await db.execute(
                select(PushDevice).where(
                    PushDevice.area_lat == area[0], PushDevice.area_lon == area[1], PushDevice.updated_at >= fresh
                )
            )
        ).scalars().all()
        if not devices:
            continue
        counts["areas"] += 1
        counts["phones"] += len(devices)
        try:
            quiet = is_quiet(raw)
            warnings = {lang: pushes_for(raw, lang) for lang in {d.language for d in devices}}
        except (KeyError, IndexError, TypeError, ValueError):
            counts["bad_forecasts"] += 1
            continue
        ids = {m.id for found in warnings.values() for m in found}
        if not ids:
            continue
        sent_before = set(
            (
                await db.execute(
                    select(PushSent.device_id, PushSent.alert_id).where(
                        PushSent.device_id.in_([d.device_id for d in devices]), PushSent.alert_id.in_(ids)
                    )
                )
            ).all()
        )
        for device in devices:
            for message in warnings[device.language]:
                if (device.device_id, message.id) in sent_before:
                    continue
                if quiet and message.severity != "severe":
                    counts["held"] += 1  # sent by the first run after QUIET_UNTIL, if still forecast
                elif device.platform not in senders:
                    counts["not_configured"] += 1
                else:
                    jobs.append((device, message))

    client = get_client()
    limit = asyncio.Semaphore(CONCURRENT_SENDS)

    async def deliver(device: PushDevice, message: Message) -> Result:
        async with limit:
            try:
                return await senders[device.platform].send(client, device.token, message)
            except (httpx.HTTPError, ValueError, KeyError, jwt.PyJWTError) as e:
                logger.warning(f"Push to {device.platform} failed: {e}")
                return "failed"

    results = await asyncio.gather(*(deliver(d, m) for d, m in jobs))
    gone = set()
    for (device, message), result in zip(jobs, results):
        if result == "sent":
            db.add(PushSent(device_id=device.device_id, alert_id=message.id))
            counts["sent"] += 1
        elif result == "gone":
            gone.add(device.device_id)
        else:
            counts["failed"] += 1
    if gone:
        await forget(db, gone)
        counts["removed"] = len(gone)
    await db.commit()
    return counts


async def forget(db: AsyncSession, device_ids: set[str]):
    """Removes phones and what was sent to them (without committing)."""
    await db.execute(delete(PushSent).where(PushSent.device_id.in_(device_ids)))
    await db.execute(delete(PushDevice).where(PushDevice.device_id.in_(device_ids)))


async def purge(db: AsyncSession):
    """Forgets phones that stopped checking in, and old records of sent warnings."""
    now = datetime.now(timezone.utc)
    await db.execute(delete(PushDevice).where(PushDevice.updated_at < now - timedelta(days=STALE_DAYS)))
    await db.execute(delete(PushSent).where(PushSent.sent_at < now - timedelta(days=SENT_KEEP_DAYS)))
    await db.commit()
