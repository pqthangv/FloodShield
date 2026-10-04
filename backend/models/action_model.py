# filepath: c:\\ZTalJaZ\\AS\\Projects\\PhungQuangThang\\PQT_API\\models\\action_model.py
from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from pydantic import BaseModel, ConfigDict
from typing import TYPE_CHECKING
from database import Base

if TYPE_CHECKING:
    from .thientai_model import ThienTai


class Action(Base):
    __tablename__ = "Actions"

    action_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    thien_tai_id = Column(
        Integer, ForeignKey("ThienTai.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)

    thien_tai = relationship("ThienTai", back_populates="actions")


class ActionResponse(BaseModel):
    action_id: int
    thien_tai_id: int
    title: str
    description: str

    model_config = ConfigDict(from_attributes=True)
