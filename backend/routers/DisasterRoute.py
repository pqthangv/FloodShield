from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from database import get_db
from models.thientai_model import (
    ThienTai,
    ThienTaiCreate,
    ThienTaiUpdate,
    ThienTaiResponse,
)

router = APIRouter()


@router.get("/thientai/", response_model=List[ThienTaiResponse])
async def read_thien_tai_all(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ThienTai).options(selectinload(ThienTai.actions)))
    thien_tai_list = result.scalars().unique().all()
    return thien_tai_list


@router.get("/thientai/{thien_tai_id}", response_model=ThienTaiResponse)
async def read_thien_tai_by_id(thien_tai_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ThienTai)
        .where(ThienTai.id == thien_tai_id)
        .options(selectinload(ThienTai.actions))
    )
    thien_tai = result.scalars().unique().first()
    if thien_tai is None:
        raise HTTPException(status_code=404, detail="ThienTai not found")
    return thien_tai


@router.post("/thientai/", response_model=ThienTaiResponse)
async def create_thien_tai(
    thien_tai: ThienTaiCreate, db: AsyncSession = Depends(get_db)
):
    db_thien_tai = ThienTai(name=thien_tai.name)
    db.add(db_thien_tai)
    await db.commit()
    await db.refresh(db_thien_tai)
    return db_thien_tai


@router.put("/thientai/{thien_tai_id}", response_model=ThienTaiResponse)
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


@router.delete("/thientai/{thien_tai_id}", response_model=ThienTaiResponse)
async def delete_thien_tai(thien_tai_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ThienTai).where(ThienTai.id == thien_tai_id))
    db_thien_tai = result.scalars().first()
    if db_thien_tai is None:
        raise HTTPException(status_code=404, detail="ThienTai not found")

    await db.delete(db_thien_tai)
    await db.commit()
    return db_thien_tai
