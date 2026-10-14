from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Integer, String
from database import Base


def utcnow():
    return datetime.now(timezone.utc)


class PushDevice(Base):
    """A phone that gets rain warnings as push notifications. One row per app install."""

    __tablename__ = "PushDevices"

    # The random id the app makes on first launch (X-Device-Id), as for community posts.
    device_id = Column(String(64), primary_key=True)
    # Firebase registration token (Android) or APNs device token (iPhone).
    token = Column(String(512), nullable=False, unique=True)
    platform = Column(String(10), nullable=False)
    language = Column(String(2), nullable=False, default="vi")
    # The area, in tenths of a degree (about 10 km): 210 / 1058 is 21.0 N, 105.8 E. Whole numbers,
    # so phones in the same area match exactly.
    area_lat = Column(Integer, nullable=False, index=True)
    area_lon = Column(Integer, nullable=False)
    # Refreshed each time the app checks in; phones that stop checking in are forgotten.
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class PushSent(Base):
    """A warning already pushed to a phone, so it is sent only once."""

    __tablename__ = "PushSent"

    device_id = Column(String(64), primary_key=True)
    alert_id = Column(String(120), primary_key=True)
    sent_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)


class PushRegistration(BaseModel):
    token: str = Field(min_length=20, max_length=512)
    platform: Literal["android", "ios"]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AreaForecast(BaseModel):
    """A raw Open-Meteo forecast for one area, downloaded by the hourly job."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    forecast: dict


class RainForecasts(BaseModel):
    forecasts: list[AreaForecast] = Field(max_length=200)
