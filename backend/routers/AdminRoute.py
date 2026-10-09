"""Endpoints for administrators / local authorities. Every request needs the X-Admin-Token
header matching the ADMIN_TOKEN environment variable. Use them from http://<server>/docs."""

from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from config import settings
from database import get_db
from models.alert_model import ManualAlert, ManualAlertCreate
from models.post_model import Post
from models.shelter_model import Shelter, ShelterCreate
from routers.PostRoute import to_response
from services import alerts


def require_admin(x_admin_token: Optional[str] = Header(None)):
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="Admin endpoints are disabled (ADMIN_TOKEN not set)")
    if x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")


router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


@router.get("/alerts")
async def list_manual_alerts(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(ManualAlert).order_by(ManualAlert.id.desc()))).scalars().all()
    return [
        {c.name: getattr(a, c.name) for c in ManualAlert.__table__.columns}
        for a in rows
    ]


@router.post("/alerts", status_code=201)
async def create_manual_alert(body: ManualAlertCreate, db: AsyncSession = Depends(get_db)):
    alert = ManualAlert(**body.model_dump())
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    alerts.forget_manual_alerts()
    return {"id": alert.id}


@router.delete("/alerts/{alert_id}")
async def delete_manual_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    alert = await db.get(ManualAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.delete(alert)
    await db.commit()
    alerts.forget_manual_alerts()
    return {"ok": True}


@router.post("/shelters", status_code=201)
async def create_shelter(body: ShelterCreate, db: AsyncSession = Depends(get_db)):
    shelter = Shelter(**body.model_dump())
    db.add(shelter)
    await db.commit()
    await db.refresh(shelter)
    return {"id": shelter.id}


@router.delete("/shelters/{shelter_id}")
async def delete_shelter(shelter_id: int, db: AsyncSession = Depends(get_db)):
    shelter = await db.get(Shelter, shelter_id)
    if shelter is None:
        raise HTTPException(status_code=404, detail="Shelter not found")
    await db.delete(shelter)
    await db.commit()
    return {"ok": True}


@router.get("/posts/reported")
async def reported_posts(request: Request, db: AsyncSession = Depends(get_db)):
    """Posts that received at least one abuse report (hidden ones included)."""
    rows = (
        await db.execute(select(Post).where(Post.report_count > 0).order_by(Post.report_count.desc()))
    ).scalars().all()
    return [
        {**to_response(request, p, None, set()).model_dump(), "report_count": p.report_count, "hidden": p.hidden}
        for p in rows
    ]


@router.post("/posts/{post_id}/restore")
async def restore_post(post_id: int, db: AsyncSession = Depends(get_db)):
    """Un-hide a post that was hidden by reports and reset its report counter."""
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    post.hidden = False
    post.report_count = 0
    await db.commit()
    return {"ok": True}
