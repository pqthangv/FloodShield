"""Push notifications for rain warnings (see services/push.py).

The app registers its push token with PUT /push and removes it with DELETE /push. The hourly job
(scripts/rain_push.py) uses the two admin endpoints: it reads the areas, downloads their
forecasts and posts them back.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Header
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from i18n import Lang, get_lang
from models.push_model import PushDevice, PushRegistration, RainForecasts
from routers.AdminRoute import require_admin
from routers.PostRoute import require_device
from routers.WeatherRoute import forecast_is_valid
from services import push

router = APIRouter()
admin = APIRouter(prefix="/admin/push", dependencies=[Depends(require_admin)])


@router.put("/push")
async def register(
    body: PushRegistration,
    x_device_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    lang: Lang = Depends(get_lang),
):
    """Rain warnings for this phone's area (rounded to ~10 km), in the request's language."""
    device_id = require_device(x_device_id, lang)
    area_lat, area_lon = push.area_of(body.latitude, body.longitude)
    # A token belongs to one install: an old row with it (e.g. after reinstalling) goes.
    await db.execute(delete(PushDevice).where(PushDevice.token == body.token, PushDevice.device_id != device_id))
    device = await db.get(PushDevice, device_id)
    if device is None:
        device = PushDevice(device_id=device_id)
        db.add(device)
    device.token = body.token
    device.platform = body.platform
    device.language = lang
    device.area_lat, device.area_lon = area_lat, area_lon
    device.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.delete("/push")
async def unregister(
    x_device_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    lang: Lang = Depends(get_lang),
):
    """No more rain warnings for this phone (the user turned notifications off)."""
    await push.forget(db, {require_device(x_device_id, lang)})
    await db.commit()
    return {"ok": True}


@admin.get("/areas")
async def areas(db: AsyncSession = Depends(get_db)):
    """The areas that have phones registered, for the hourly job to download forecasts for."""
    fresh = datetime.now(timezone.utc) - timedelta(days=push.STALE_DAYS)
    rows = (
        await db.execute(
            select(PushDevice.area_lat, PushDevice.area_lon).where(PushDevice.updated_at >= fresh).distinct()
        )
    ).all()
    return {"areas": [{"latitude": lat / 10, "longitude": lon / 10} for lat, lon in sorted(rows)]}


@admin.post("/rain")
async def rain(body: RainForecasts, db: AsyncSession = Depends(get_db)):
    """Sends the new rain warnings in these forecasts. Unlike forecasts sent by phones, these come
    from the hourly job (admin token), so they may be used for every phone in the area."""
    forecasts = [(f.latitude, f.longitude, f.forecast) for f in body.forecasts
                 if forecast_is_valid(f.forecast, f.latitude, f.longitude)]
    result = await push.send_rain_warnings(db, forecasts)
    result["bad_forecasts"] += len(body.forecasts) - len(forecasts)
    return result
