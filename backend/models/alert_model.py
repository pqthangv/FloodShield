from datetime import datetime, timezone
from typing import Literal, Optional
from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from pydantic import BaseModel, Field
from database import Base

Severity = Literal["info", "moderate", "high", "severe"]
AlertCategory = Literal[
    "storm",
    "flood",
    "heavy_rain",
    "urban_flood",
    "landslide",
    "wind",
    "heat",
    "drought",
    "earthquake",
    "wildfire",
    "volcano",
    "other",
]


class ManualAlert(Base):
    """A warning issued by an administrator (e.g. relayed from the local authorities)."""

    __tablename__ = "ManualAlerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(20), nullable=False, default="other")
    severity = Column(String(10), nullable=False, default="moderate")
    area = Column(String(200), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_km = Column(Float, nullable=False, default=50)
    source = Column(String(200), nullable=True)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class ManualAlertCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3)
    category: AlertCategory = "other"
    severity: Literal["moderate", "high", "severe"] = "moderate"
    area: Optional[str] = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_km: float = Field(50, gt=0, le=2000)
    source: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class AlertDetail(BaseModel):
    label: str
    value: str


class AlertResponse(BaseModel):
    id: str
    category: str
    severity: Severity
    title: str
    area: str
    description: str
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    source: str
    distance_km: Optional[float] = None
    details: list[AlertDetail] = []
    # Matches a ThienTai id so the app can open the right "what to do" checklist.
    disaster_type_id: Optional[int] = None
    url: Optional[str] = None


class AlertListResponse(BaseModel):
    alerts: list[AlertResponse]
    updated_at: str
