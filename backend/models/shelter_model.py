from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from pydantic import BaseModel, Field
from database import Base


class Shelter(Base):
    """An official evacuation point entered by an administrator."""

    __tablename__ = "Shelters"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    address = Column(String(255), nullable=True)
    kind = Column(String(40), nullable=False, default="shelter")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    capacity = Column(Integer, nullable=True)
    phone = Column(String(40), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class ShelterCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    address: Optional[str] = None
    kind: str = "shelter"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    capacity: Optional[int] = None
    phone: Optional[str] = None
    note: Optional[str] = None


class ShelterResponse(BaseModel):
    id: str
    name: str
    address: Optional[str]
    kind: str
    kind_label: str
    latitude: float
    longitude: float
    distance_km: float
    capacity: Optional[int] = None
    phone: Optional[str] = None
    note: Optional[str] = None
    official: bool
    source: str


class ShelterListResponse(BaseModel):
    shelters: list[ShelterResponse]
