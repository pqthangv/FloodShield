import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from config import settings
from database import Base, SessionLocal, engine

# Import the models so their tables are registered before create_all.
from models import action_model, alert_model, post_model, river_model, shelter_model, thientai_model  # noqa: F401
from routers import AdminRoute, DisasterRoute, PostRoute, ShelterRoute, WeatherRoute
from seed import seed_disaster_types
from services import upstream
from services.cache import cache
from services.http import close_client

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Create the tables and seed reference data
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        await seed_disaster_types(db)


async def cleanup_loop():
    while True:
        try:
            async with SessionLocal() as db:
                removed = await PostRoute.purge_old_posts(db)
            if removed:
                logger.info(f"Deleted {removed} expired posts")
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
        await asyncio.sleep(6 * 3600)


# Lifespan event handler
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    cleanup = asyncio.create_task(cleanup_loop())
    yield
    cleanup.cancel()
    await close_client()


app = FastAPI(
    title="FloodShield API",
    description=(
        "Dự báo lũ và thiên tai theo thời gian thực, thời tiết, nơi sơ tán gần nhất, "
        "cảnh báo theo vị trí và chia sẻ thông tin ngập lụt từ cộng đồng."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(DisasterRoute.router, prefix="/api/v1", tags=["disasters"])
app.include_router(WeatherRoute.router, prefix="/api/v1", tags=["weather & alerts"])
app.include_router(ShelterRoute.router, prefix="/api/v1", tags=["shelters"])
app.include_router(PostRoute.router, prefix="/api/v1", tags=["community"])
app.include_router(AdminRoute.router, prefix="/api/v1", tags=["admin"])


@app.get("/health", tags=["system"])
async def health(upstream: bool = False):
    """`?upstream=1` also shows whether this server can reach the outside data services."""
    if not upstream:
        return {"status": "ok"}
    return {
        "status": "ok",
        "database": engine.dialect.name,  # "postgresql" on Render, "sqlite" when DATABASE_URL is missing
        "upstream": await cache.get_or_set("health:upstream", 300, upstream.check_upstream),
    }


@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy():
    contact = settings.contact_email or "(chưa cấu hình / not configured)"
    return PRIVACY_HTML.replace("{contact}", contact)


PRIVACY_HTML = """<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FloodShield - Chính sách quyền riêng tư</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:auto;padding:16px;line-height:1.55;color:#1F2D54}
h1{font-size:1.5em}h2{font-size:1.15em;margin-top:1.6em}</style></head><body>
<h1>Chính sách quyền riêng tư - FloodShield</h1>
<p>FloodShield giúp bạn nhận cảnh báo lũ lụt, thiên tai, thời tiết và chia sẻ thông tin ngập lụt với cộng đồng.
Chúng tôi chỉ thu thập dữ liệu cần thiết cho các chức năng này.</p>
<h2>1. Dữ liệu chúng tôi thu thập</h2>
<ul>
<li><b>Vị trí</b>: dùng để lấy dự báo thời tiết, cảnh báo, nơi sơ tán và bài đăng gần bạn. Vị trí được gửi đến máy chủ
FloodShield khi bạn mở ứng dụng và khi ứng dụng kiểm tra cảnh báo định kỳ (nếu bạn bật thông báo). Chúng tôi không lưu lịch sử vị trí của bạn.</li>
<li><b>Bài đăng cộng đồng</b>: tên hiển thị, nội dung, mức nước, ảnh và vị trí bạn gửi kèm. Bài đăng được <b>công khai</b>
cho người dùng khác. Ảnh được xử lý để xóa thông tin EXIF (bao gồm tọa độ GPS trong ảnh).</li>
<li><b>Mã thiết bị ngẫu nhiên</b>: được tạo khi cài ứng dụng, dùng để bạn quản lý/xóa bài đăng của mình và chống spam.
Mã này không gắn với danh tính, số điện thoại hay tài khoản Google của bạn.</li>
</ul>
<p>Chúng tôi không yêu cầu đăng ký tài khoản, không hiển thị quảng cáo và không bán dữ liệu.</p>
<h2>2. Bên thứ ba</h2>
<p>Máy chủ FloodShield lấy dữ liệu từ Open-Meteo (thời tiết, GloFAS/Copernicus), GDACS (thiên tai) và OpenStreetMap
(địa danh, nơi sơ tán), sử dụng tọa độ đã được làm tròn. Ứng dụng có thể mở Google Maps khi bạn chọn chỉ đường.</p>
<h2>3. Lưu trữ và xóa dữ liệu</h2>
<p>Bài đăng hiển thị trong 7 ngày và có thể được lưu trữ tối đa 90 ngày. Bạn có thể xóa từng bài đăng, hoặc xóa toàn bộ
dữ liệu của mình trong <b>Cài đặt &rarr; Xóa dữ liệu của tôi</b>. Bài đăng vi phạm có thể bị ẩn hoặc xóa.</p>
<h2>4. Liên hệ</h2>
<p>Email: {contact}</p>
<hr>
<h1>Privacy Policy (English summary)</h1>
<p>FloodShield collects your location (to provide forecasts, alerts, shelters and nearby reports; location history is
not stored), the content of community reports you choose to publish (display name, text, water level, photo with
EXIF/GPS metadata removed, location - all public), and a random device identifier used to manage your own posts and
prevent spam. No account, no ads, no sale of data. Weather, flood and disaster data come from Open-Meteo, GloFAS,
GDACS and OpenStreetMap. You can delete all your data in Settings &rarr; Delete my data. Contact: {contact}</p>
</body></html>"""
