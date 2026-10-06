from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from database import get_db
from i18n import Lang, get_lang
from models.thientai_model import (
    ThienTai,
    ThienTaiCreate,
    ThienTaiUpdate,
    ThienTaiResponse,
)

from routers.AdminRoute import require_admin
from seed_en import ACTIONS_EN, NAMES_EN

router = APIRouter()


def localized(item: ThienTai, lang: Lang) -> dict:
    """Disaster type with its actions, in English when a translation exists."""
    data = ThienTaiResponse.model_validate(item).model_dump()
    if lang == "en":
        data["name"] = NAMES_EN.get((item.id, item.name), item.name)
        for action in data["actions"]:
            english = ACTIONS_EN.get((item.id, action["title"]))
            if english:
                action["title"], action["description"] = english
    return data


@router.get("/thientai/", response_model=List[ThienTaiResponse])
async def read_thien_tai_all(db: AsyncSession = Depends(get_db), lang: Lang = Depends(get_lang)):
    result = await db.execute(select(ThienTai).options(selectinload(ThienTai.actions)))
    thien_tai_list = result.scalars().unique().all()
    return [localized(item, lang) for item in thien_tai_list]


@router.get("/thientai/{thien_tai_id}", response_model=ThienTaiResponse)
async def read_thien_tai_by_id(
    thien_tai_id: int, db: AsyncSession = Depends(get_db), lang: Lang = Depends(get_lang)
):
    result = await db.execute(
        select(ThienTai)
        .where(ThienTai.id == thien_tai_id)
        .options(selectinload(ThienTai.actions))
    )
    thien_tai = result.scalars().unique().first()
    if thien_tai is None:
        raise HTTPException(status_code=404, detail="ThienTai not found")
    return localized(thien_tai, lang)


# Changing the reference data requires the admin token (X-Admin-Token).
@router.post("/thientai/", response_model=ThienTaiResponse, dependencies=[Depends(require_admin)])
async def create_thien_tai(
    thien_tai: ThienTaiCreate, db: AsyncSession = Depends(get_db)
):
    db_thien_tai = ThienTai(name=thien_tai.name)
    db.add(db_thien_tai)
    await db.commit()
    await db.refresh(db_thien_tai)
    return db_thien_tai


@router.put("/thientai/{thien_tai_id}", response_model=ThienTaiResponse, dependencies=[Depends(require_admin)])
async def update_thien_tai(
    thien_tai_id: int, thien_tai: ThienTaiUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ThienTai).where(ThienTai.id == thien_tai_id))
    db_thien_tai = result.scalars().first()
    if db_thien_tai is None:
        raise HTTPException(status_code=404, detail="ThienTai not found")

    db_thien_tai.name = thien_tai.name
    await db.commit()
    await db.refresh(db_thien_tai)
    return db_thien_tai


@router.delete("/thientai/{thien_tai_id}", response_model=ThienTaiResponse, dependencies=[Depends(require_admin)])
async def delete_thien_tai(thien_tai_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ThienTai).where(ThienTai.id == thien_tai_id))
    db_thien_tai = result.scalars().first()
    if db_thien_tai is None:
        raise HTTPException(status_code=404, detail="ThienTai not found")

    await db.delete(db_thien_tai)
    await db.commit()
    return db_thien_tai
