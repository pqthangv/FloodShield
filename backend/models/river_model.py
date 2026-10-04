from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Float, Integer, UniqueConstraint
from database import Base


class RiverThreshold(Base):
    """Flood thresholds (return-period discharge levels) for one GloFAS grid cell.

    Computing them needs 20 years of daily history, which is expensive on the Open-Meteo
    quota, so they are stored permanently and refreshed once a year.
    """

    __tablename__ = "RiverThresholds"
    __table_args__ = (UniqueConstraint("latitude", "longitude"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    rp2 = Column(Float, nullable=True)
    rp5 = Column(Float, nullable=True)
    rp20 = Column(Float, nullable=True)
    mean = Column(Float, nullable=True)
    years = Column(Integer, nullable=False, default=0)
    computed_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
