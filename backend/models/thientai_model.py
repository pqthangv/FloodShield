# filepath: c:\\ZTalJaZ\\AS\\Projects\\PhungQuangThang\\PQT_API\\models\\thientai_model.py
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from pydantic import BaseModel, ConfigDict
from typing import List
from database import Base
from .action_model import Action, ActionResponse


class ThienTai(Base):
    __tablename__ = "ThienTai"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)

    actions = relationship("Action", back_populates="thien_tai", lazy="selectin")


class ThienTaiCreate(BaseModel):
    name: str


class ThienTaiUpdate(BaseModel):
    name: str


class ThienTaiResponse(BaseModel):
    id: int
    name: str
    actions: List[ActionResponse] = []

    model_config = ConfigDict(from_attributes=True)
