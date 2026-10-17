import hashlib
import io
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from config import public_base_url, settings
from database import get_db
from i18n import Lang, get_lang, t
from models.post_model import (
    BannedDevice,
    ConfirmResponse,
    Post,
    PostCategory,
    PostImage,
    PostListResponse,
    PostResponse,
    PostVote,
    ReportRequest,
    WaterLevel,
)
from services import moderation, osm, push
from services.geo import bounding_box, haversine_km

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_IMAGE_SIDE = 1600
# The app's picker sends photos of at most 1600 x 1600 (AddReport.tsx), so anything far bigger
# didn't come from the app. It is refused before decoding: a 17 KB PNG can claim 12000 x 12000
# pixels and take about 600 MB of memory to open, more than the whole Render free plan.
MAX_IMAGE_PIXELS = 4096 * 4096


def require_device(x_device_id: Optional[str], lang: Lang = "vi") -> str:
    if not x_device_id or not (8 <= len(x_device_id) <= 64):
        raise HTTPException(status_code=400, detail=t(lang, "err_device_id"))
    return x_device_id


def author_id(device_id: str) -> str:
    return hashlib.sha256(device_id.encode()).hexdigest()[:16]


def image_url(request: Request, path: Optional[str], admin: bool = False) -> Optional[str]:
    if not path:
        return None
    base = public_base_url() or str(request.base_url).rstrip("/")
    return f"{base}/api/v1/{'admin/' if admin else ''}images/{path}"


def to_response(request: Request, post: Post, device_id: Optional[str], confirmed: set[int],
                lat: Optional[float] = None, lon: Optional[float] = None) -> PostResponse:
    distance = None
    if lat is not None and lon is not None:
        distance = round(haversine_km(lat, lon, post.latitude, post.longitude), 2)
    created = post.created_at if post.created_at.tzinfo else post.created_at.replace(tzinfo=timezone.utc)
    return PostResponse(
        id=post.id,
        author_name=post.author_name,
        author_id=author_id(post.device_id),
        category=post.category,
        water_level=post.water_level,
        description=post.description,
        latitude=post.latitude,
        longitude=post.longitude,
        address=post.address,
        image_url=image_url(request, post.image_path),
        created_at=created,
        confirm_count=post.confirm_count,
        distance_km=distance,
        is_mine=device_id is not None and post.device_id == device_id,
        confirmed_by_me=post.id in confirmed,
    )


def encode_image(data: bytes, lang: Lang = "vi") -> bytes:
    """Re-encode the upload as JPEG: validates it is a real image, strips EXIF (which may
    contain the exact GPS position of the user's home) and limits the size."""
    try:
        # Only reads the header; Pillow refuses truly huge sizes itself (DecompressionBombError).
        img = Image.open(io.BytesIO(data))
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail=t(lang, "err_bad_image"))
    if img.width * img.height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=400, detail=t(lang, "err_bad_image"))
    try:
        img = ImageOps.exif_transpose(img)
    except OSError:
        raise HTTPException(status_code=400, detail=t(lang, "err_bad_image"))
    img = img.convert("RGB")
    img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=80, optimize=True)
    return out.getvalue()


async def remove_image(db: AsyncSession, path: Optional[str]):
    if path:
        await db.execute(delete(PostImage).where(PostImage.name == path))


async def my_confirmations(db: AsyncSession, device_id: Optional[str], post_ids: list[int]) -> set[int]:
    if not device_id or not post_ids:
        return set()
    rows = await db.execute(
        select(PostVote.post_id).where(
            PostVote.device_id == device_id, PostVote.kind == "confirm", PostVote.post_id.in_(post_ids)
        )
    )
    return set(rows.scalars().all())


RETENTION_DAYS = 90


async def purge_old_posts(db: AsyncSession) -> int:
    """Delete posts (and their photos) older than the retention period from the privacy policy."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    old = (await db.execute(select(Post).where(Post.created_at < cutoff))).scalars().all()
    for post in old:
        await remove_image(db, post.image_path)
        await db.execute(delete(PostVote).where(PostVote.post_id == post.id))
        await db.delete(post)
    await db.commit()
    return len(old)


@router.get("/posts", response_model=PostListResponse)
async def list_posts(
    request: Request,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: float = Query(50, gt=0, le=500),
    hours: int = Query(168, gt=0, le=24 * 60),
    limit: int = Query(50, gt=0, le=100),
    before_id: Optional[int] = None,
    x_device_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Recent community reports, newest first. Pass lat/lon to only get reports nearby."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    query = select(Post).where(Post.hidden.is_(False), Post.created_at >= since)
    if before_id:
        query = query.where(Post.id < before_id)
    if lat is not None and lon is not None:
        min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius_km)
        query = query.where(
            Post.latitude.between(min_lat, max_lat), Post.longitude.between(min_lon, max_lon)
        )
    posts = (await db.execute(query.order_by(Post.id.desc()).limit(limit))).scalars().all()
    confirmed = await my_confirmations(db, x_device_id, [p.id for p in posts])
    return {"posts": [to_response(request, p, x_device_id, confirmed, lat, lon) for p in posts]}


@router.get("/images/{name}", include_in_schema=False)
async def get_image(name: str, db: AsyncSession = Depends(get_db), lang: Lang = Depends(get_lang)):
    image = await db.get(PostImage, name)
    # The photo of a hidden post is hidden too: whoever saw the post before still has the link.
    # It stays in the database so the admin can look at it before restoring the post
    # (/admin/images/<name>).
    hidden = await db.scalar(select(Post.id).where(Post.image_path == name, Post.hidden.is_(True)).limit(1))
    if image is None or hidden is not None:
        raise HTTPException(status_code=404, detail=t(lang, "err_image_not_found"))
    # Names are random and never reused, so phones may cache them for good.
    return Response(
        content=image.data,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.post("/posts", response_model=PostResponse, status_code=201)
async def create_post(
    request: Request,
    author_name: str = Form(..., min_length=1, max_length=40),
    description: str = Form(..., min_length=3, max_length=1000),
    latitude: float = Form(..., ge=-90, le=90),
    longitude: float = Form(..., ge=-180, le=180),
    category: PostCategory = Form("flood"),
    water_level: Optional[WaterLevel] = Form(None),
    address: Optional[str] = Form(None, max_length=255),
    image: Optional[UploadFile] = File(None),
    x_device_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    lang: Lang = Depends(get_lang),
):
    device_id = require_device(x_device_id, lang)
    if await db.get(BannedDevice, device_id) is not None:
        raise HTTPException(status_code=403, detail=t(lang, "err_banned"))

    hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = await db.scalar(
        select(func.count(Post.id)).where(Post.device_id == device_id, Post.created_at >= hour_ago)
    )
    if recent >= settings.max_posts_per_hour:
        raise HTTPException(status_code=429, detail=t(lang, "err_too_many_posts"))
    if moderation.has_bad_words(author_name, description, address):
        raise HTTPException(status_code=422, detail=t(lang, "err_bad_words"))

    image_path = None
    if image is not None and image.filename:
        data = await image.read(settings.max_upload_mb * 1024 * 1024 + 1)
        if len(data) > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(status_code=413, detail=t(lang, "err_image_too_large", mb=settings.max_upload_mb))
        image_path = f"{uuid.uuid4().hex}.jpg"
        db.add(PostImage(name=image_path, data=encode_image(data, lang)))

    if not address:
        place = await osm.reverse_geocode(latitude, longitude)
        address = place["display"] if place else None

    post = Post(
        device_id=device_id,
        author_name=author_name.strip(),
        category=category,
        water_level=water_level,
        description=description.strip(),
        latitude=latitude,
        longitude=longitude,
        address=address,
        image_path=image_path,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return to_response(request, post, device_id, set())


@router.post("/posts/{post_id}/confirm", response_model=ConfirmResponse)
async def toggle_confirm(
    post_id: int,
    x_device_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    lang: Lang = Depends(get_lang),
):
    """'Tôi cũng thấy' - confirms the situation is real. Calling again removes the confirmation."""
    device_id = require_device(x_device_id, lang)
    post = await db.get(Post, post_id)
    if post is None or post.hidden:
        raise HTTPException(status_code=404, detail=t(lang, "err_post_not_found"))
    vote = await db.scalar(
        select(PostVote).where(PostVote.post_id == post_id, PostVote.device_id == device_id, PostVote.kind == "confirm")
    )
    if vote:
        await db.delete(vote)
        post.confirm_count = max(0, post.confirm_count - 1)
        confirmed = False
    else:
        db.add(PostVote(post_id=post_id, device_id=device_id, kind="confirm"))
        post.confirm_count += 1
        confirmed = True
    await db.commit()
    return {"confirm_count": post.confirm_count, "confirmed_by_me": confirmed}


@router.post("/posts/{post_id}/report")
async def report_post(
    post_id: int,
    body: ReportRequest,
    x_device_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    lang: Lang = Depends(get_lang),
):
    """Flag a post as false or abusive. Posts are hidden automatically after a few reports."""
    device_id = require_device(x_device_id, lang)
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail=t(lang, "err_post_not_found"))
    existing = await db.scalar(
        select(PostVote).where(PostVote.post_id == post_id, PostVote.device_id == device_id, PostVote.kind == "report")
    )
    if not existing:
        db.add(PostVote(post_id=post_id, device_id=device_id, kind="report", reason=body.reason[:200]))
        post.report_count += 1
        if post.report_count >= settings.report_hide_threshold:
            post.hidden = True
        await db.commit()
    return {"ok": True}


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    x_device_id: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    lang: Lang = Depends(get_lang),
):
    post = await db.get(Post, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail=t(lang, "err_post_not_found"))
    is_admin = bool(settings.admin_token) and x_admin_token == settings.admin_token
    if not is_admin and post.device_id != x_device_id:
        raise HTTPException(status_code=403, detail=t(lang, "err_not_your_post"))
    await remove_image(db, post.image_path)
    await db.execute(delete(PostVote).where(PostVote.post_id == post_id))
    await db.delete(post)
    await db.commit()
    return {"ok": True}


@router.delete("/me")
async def delete_my_data(
    x_device_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    lang: Lang = Depends(get_lang),
):
    """Deletes every post, photo and vote created from this device, and its push registration
    (Google Play data deletion)."""
    device_id = require_device(x_device_id, lang)
    deleted = await delete_device_data(db, device_id)
    await db.commit()
    return {"deleted_posts": deleted}


async def delete_device_data(db: AsyncSession, device_id: str) -> int:
    """Removes a device's posts, photos and votes (without committing). Returns the number of posts."""
    posts = (await db.execute(select(Post).where(Post.device_id == device_id))).scalars().all()
    for post in posts:
        await remove_image(db, post.image_path)
        await db.execute(delete(PostVote).where(PostVote.post_id == post.id))
        await db.delete(post)
    # Remove this device's confirmations from other people's posts as well.
    votes = (
        await db.execute(select(PostVote).where(PostVote.device_id == device_id, PostVote.kind == "confirm"))
    ).scalars().all()
    for vote in votes:
        other = await db.get(Post, vote.post_id)
        if other is not None:
            other.confirm_count = max(0, other.confirm_count - 1)
    await db.execute(delete(PostVote).where(PostVote.device_id == device_id))
    await push.forget(db, {device_id})
    return len(posts)
