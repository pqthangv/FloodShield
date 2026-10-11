import asyncio
import logging
import secrets
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from config import settings
from database import Base, SessionLocal, engine

# Import the models so their tables are registered before create_all.
from models import action_model, alert_model, post_model, river_model, shelter_model, thientai_model  # noqa: F401
from routers import AdminRoute, DisasterRoute, PostRoute, ShelterRoute, WeatherRoute
from seed import seed_disaster_types
from services.cache import cache
from services.upstream import check_upstream
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
    # The API documentation is behind the admin login (see below), not public.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
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
        "upstream": await cache.get_or_set("health:upstream", 300, check_upstream),
    }


_docs_login = HTTPBasic(realm="FloodShield admin", auto_error=False)


def require_docs_login(credentials: Optional[HTTPBasicCredentials] = Depends(_docs_login)):
    """The browser asks for a login: any username, and the ADMIN_TOKEN as password. Without an
    ADMIN_TOKEN (development on a PC) the documentation stays open, as admin routes are off anyway."""
    token = settings.admin_token
    if not token:
        return
    if credentials is None or not secrets.compare_digest(credentials.password.encode(), token.encode()):
        raise HTTPException(
            status_code=401,
            detail="Log in with the ADMIN_TOKEN as password",
            headers={"WWW-Authenticate": 'Basic realm="FloodShield admin"'},
        )


@app.get("/docs", include_in_schema=False, dependencies=[Depends(require_docs_login)])
async def api_docs():
    return get_swagger_ui_html(openapi_url="/openapi.json", title="FloodShield API")


@app.get("/openapi.json", include_in_schema=False, dependencies=[Depends(require_docs_login)])
async def api_schema():
    return app.openapi()


@app.get("/api/v1/contact", tags=["system"])
async def contact():
    """The address shown in the app's Settings > Contact us (CONTACT_EMAIL; null when not set)."""
    return {"email": settings.contact_email or None}


@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy():
    """In Vietnamese: the address given to Google Play and the App Store. English: /privacy/en."""
    return info_page("privacy", "vi")


@app.get("/privacy/en", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy_en():
    return info_page("privacy", "en")


@app.get("/support", response_class=HTMLResponse, include_in_schema=False)
async def support():
    """Help and contact (the App Store's Support URL), in Vietnamese. English: /support/en."""
    return info_page("support", "vi")


@app.get("/support/en", response_class=HTMLResponse, include_in_schema=False)
async def support_en():
    return info_page("support", "en")


def info_page(page: str, lang: str) -> str:
    """The privacy policy and support pages: Vietnamese at /<page>, English at /<page>/en, each
    linking to the other language."""
    contact = settings.contact_email or ("(chưa cấu hình)" if lang == "vi" else "(not configured)")
    switch = (
        f'<p class="lang"><a href="/{page}/en" lang="en">English</a></p>'
        if lang == "vi"
        else f'<p class="lang"><a href="/{page}" lang="vi">Tiếng Việt</a></p>'
    )
    body = PAGE_BODIES[page][lang].replace("{contact}", contact)
    return PAGE.format(lang=lang, title=PAGE_TITLES[page][lang], switch=switch, body=body)


PAGE_TITLES = {
    "privacy": {"vi": "FloodShield - Chính sách quyền riêng tư", "en": "FloodShield - Privacy Policy"},
    "support": {"vi": "FloodShield - Hỗ trợ", "en": "FloodShield - Support"},
}

PAGE = """<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>body{{font-family:system-ui,sans-serif;max-width:760px;margin:auto;padding:16px;line-height:1.55;color:#1F2D54}}
h1{{font-size:1.5em}}h2{{font-size:1.15em;margin-top:1.6em}}h3{{font-size:1em;margin:1.2em 0 .3em}}
.lang{{text-align:right;margin:0}}a{{color:#2A78D6}}</style></head><body>
{switch}
{body}</body></html>"""

PRIVACY_VI = """<h1>Chính sách quyền riêng tư - FloodShield</h1>
<p>FloodShield giúp bạn nhận cảnh báo lũ lụt, thiên tai, thời tiết và chia sẻ thông tin ngập lụt với cộng đồng.
Chúng tôi chỉ thu thập dữ liệu cần thiết cho các chức năng này. FloodShield là ứng dụng độc lập, không thuộc và không
đại diện cho bất kỳ cơ quan nhà nước nào.</p>
<h2>1. Dữ liệu chúng tôi thu thập</h2>
<ul>
<li><b>Vị trí</b>: dùng để lấy dự báo thời tiết, cảnh báo, nơi sơ tán và bài đăng gần bạn. Vị trí được gửi đến máy chủ
FloodShield khi bạn mở ứng dụng và khi ứng dụng kiểm tra cảnh báo định kỳ (nếu bạn bật thông báo). Chúng tôi không lưu lịch sử vị trí của bạn.</li>
<li><b>Bài đăng cộng đồng</b>: tên hiển thị, nội dung, mức nước, ảnh và vị trí bạn gửi kèm. Bài đăng được <b>công khai</b>
cho người dùng khác. Ảnh được xử lý để xóa thông tin EXIF (bao gồm tọa độ GPS trong ảnh).</li>
<li><b>Mã thiết bị ngẫu nhiên</b>: được tạo khi cài ứng dụng, dùng để bạn quản lý/xóa bài đăng của mình và chống spam.
Mã này không gắn với danh tính, số điện thoại hay tài khoản Google/Apple của bạn.</li>
</ul>
<p>Chúng tôi không yêu cầu đăng ký tài khoản, không hiển thị quảng cáo và không bán dữ liệu.</p>
<h2>2. Bên thứ ba</h2>
<p>Máy chủ FloodShield lấy dữ liệu từ Open-Meteo (thời tiết, GloFAS/Copernicus), GDACS (thiên tai) và OpenStreetMap
(địa danh, nơi sơ tán), sử dụng tọa độ đã được làm tròn. Ứng dụng cũng gửi trực tiếp tọa độ đã làm tròn tới hai dịch vụ
này: tới Open-Meteo (open-meteo.com) để lấy dự báo thời tiết (khoảng 1 km) và dự báo lũ sông (khoảng 10 km), và tới máy chủ Overpass của OpenStreetMap
(overpass-api.de và máy chủ dự phòng maps.mail.ru, khoảng 2 km) để tìm nơi sơ tán gần bạn. Ứng dụng có thể mở
Google Maps khi bạn chọn chỉ đường.</p>
<h2>3. Lưu trữ và xóa dữ liệu</h2>
<p>Bài đăng hiển thị trong 7 ngày và có thể được lưu trữ tối đa 90 ngày. Bạn có thể xóa từng bài đăng, hoặc xóa toàn bộ
dữ liệu của mình trong <b>Cài đặt &rarr; Xóa dữ liệu của tôi</b>. Bài đăng vi phạm có thể bị ẩn hoặc xóa; khi đó mã
thiết bị của người vi phạm có thể được giữ lại để chặn đăng bài.</p>
<h2>4. Liên hệ</h2>
<p>Email: {contact}</p>
"""

PRIVACY_EN = """<h1>Privacy Policy - FloodShield</h1>
<p>FloodShield gives you flood, disaster and weather alerts, and lets you share flooding information with your
community. We only collect the data these features need. FloodShield is an independent app. It is not affiliated with,
and does not represent, any government agency.</p>
<h2>1. Data we collect</h2>
<ul>
<li><b>Location</b>: used to get the weather forecast, alerts, shelters and posts near you. Your location is sent to the
FloodShield server when you open the app, and when the app checks for alerts in the background (if you turned on
notifications). We do not keep a history of your locations.</li>
<li><b>Community posts</b>: the display name, text, water level, photo and location you send with a post. Posts are
<b>public</b>: other users can see them. Photos are processed to remove their EXIF information (including the GPS
coordinates stored in a photo).</li>
<li><b>Random device ID</b>: created when you install the app, so you can manage and delete your own posts, and to prevent
spam. It is not linked to your identity, your phone number, or your Google or Apple account.</li>
</ul>
<p>We don't require an account, don't show ads and don't sell data.</p>
<h2>2. Third parties</h2>
<p>The FloodShield server gets data from Open-Meteo (weather, GloFAS/Copernicus), GDACS (disasters) and OpenStreetMap
(place names, shelters), using rounded coordinates. The app also sends rounded coordinates directly to two of these
services: to Open-Meteo (open-meteo.com) for the weather forecast (about 1 km) and the river flood forecast (about
10 km), and to OpenStreetMap's Overpass servers
(overpass-api.de, with maps.mail.ru as backup, about 2 km) to find shelters near you. The app can open Google Maps when
you ask for directions.</p>
<h2>3. Storing and deleting data</h2>
<p>Posts are shown for 7 days and may be stored for up to 90 days. You can delete each of your posts, or delete all of
your data in <b>Settings &rarr; Delete my data</b>. Posts that break the community rules may be hidden or removed; the
device ID of someone who breaks them may then be kept, to block it from posting.</p>
<h2>4. Contact</h2>
<p>Email: {contact}</p>
"""

SUPPORT_VI = """<h1>Hỗ trợ - FloodShield</h1>
<p>FloodShield cảnh báo mưa lớn, lũ sông và thiên tai theo vị trí của bạn, chỉ nơi sơ tán gần nhất và giúp bạn chia sẻ
tình hình ngập với cộng đồng. Ứng dụng miễn phí, không cần tài khoản.</p>
<p><b>Khi gặp nguy hiểm, hãy gọi 112 (cứu nạn), 114 (cứu hỏa) hoặc 115 (cấp cứu) trước tiên.</b></p>
<h2>Liên hệ</h2>
<p>Email: <a href="mailto:{contact}">{contact}</a>. Bạn cũng có thể vào <b>Cài đặt &rarr; Liên hệ</b> trong ứng dụng.</p>
<h2>Câu hỏi thường gặp</h2>
<h3>Vì sao tôi không nhận được thông báo?</h3>
<ul>
<li>Cho phép FloodShield gửi thông báo trong phần Cài đặt của điện thoại.</li>
<li>Trong ứng dụng: <b>Cài đặt &rarr; Cảnh báo thiên tai</b> phải đang bật.</li>
<li>Trên iPhone: bật <b>Cài đặt &rarr; Cài đặt chung &rarr; Làm mới ứng dụng trong nền</b>. iOS tự quyết định lúc nào
ứng dụng được kiểm tra, nên thông báo có thể đến chậm. Mở ứng dụng để xem cảnh báo mới nhất ngay.</li>
</ul>
<h3>Cảnh báo dựa trên nguồn nào?</h3>
<p>Mưa, gió và nắng nóng: dự báo của Open-Meteo, so với ngưỡng của Trung tâm Dự báo Khí tượng Thủy văn Quốc gia (mưa từ
50 mm/ngày). Lũ sông: GloFAS (Copernicus). Bão, lũ, động đất: GDACS. Thông tin chỉ mang tính tham khảo; luôn làm theo
hướng dẫn của chính quyền.</p>
<h3>Ứng dụng hiển thị sai vị trí</h3>
<p>Cho phép FloodShield dùng vị trí, hoặc chọn nơi khác: <b>Cài đặt &rarr; Vị trí</b>.</p>
<h3>Làm sao báo cáo hoặc ẩn bài đăng không phù hợp?</h3>
<p>Bấm <b>…</b> trên bài đăng, chọn <b>Báo cáo vi phạm</b> hoặc <b>Ẩn bài của người này</b>. Bài bị nhiều người báo cáo
sẽ tự động bị ẩn; chúng tôi xem xét các báo cáo và chặn người vi phạm.</p>
<h3>Làm sao xóa dữ liệu của tôi?</h3>
<p><b>Cài đặt &rarr; Xóa dữ liệu của tôi</b> xóa mọi bài đăng, ảnh và lượt xác nhận của bạn. Xem thêm
<a href="/privacy">Chính sách quyền riêng tư</a>.</p>
<p>FloodShield là ứng dụng độc lập, không thuộc và không đại diện cho bất kỳ cơ quan nhà nước nào.</p>
"""

SUPPORT_EN = """<h1>Support - FloodShield</h1>
<p>FloodShield warns you about heavy rain, river floods and natural disasters where you are, shows the nearest safe places
and lets you share flood updates with your community. It is free and needs no account.</p>
<p><b>If you are in danger, call 112 (rescue), 114 (fire) or 115 (ambulance) first.</b></p>
<h2>Contact</h2>
<p>Email: <a href="mailto:{contact}">{contact}</a>. You can also use <b>Settings &rarr; Contact us</b> in the app.</p>
<h2>Frequently asked questions</h2>
<h3>Why don't I get notifications?</h3>
<ul>
<li>Allow notifications for FloodShield in your phone's Settings.</li>
<li>In the app, <b>Settings &rarr; Disaster alerts</b> must be on.</li>
<li>On iPhone, turn on <b>Settings &rarr; General &rarr; Background App Refresh</b>. iOS decides when the app may check,
so notifications can arrive late. Open the app to see the latest alerts at once.</li>
</ul>
<h3>Where do the alerts come from?</h3>
<p>Rain, wind and heat: Open-Meteo's forecast, compared with the thresholds of Vietnam's National Center for
Hydro-Meteorological Forecasting (rain from 50 mm a day). River floods: GloFAS (Copernicus). Storms, floods and
earthquakes: GDACS. For guidance only; always follow the instructions of the authorities.</p>
<h3>The app shows the wrong place</h3>
<p>Allow FloodShield to use your location, or choose another place in <b>Settings &rarr; Location</b>.</p>
<h3>How do I report or hide an inappropriate post?</h3>
<p>Tap <b>…</b> on the post and choose <b>Report</b> or <b>Hide posts from this person</b>. Posts reported by several
people are hidden automatically; we review reports and block people who break the rules.</p>
<h3>How do I delete my data?</h3>
<p><b>Settings &rarr; Delete my data</b> removes all your posts, photos and confirmations. See also the
<a href="/privacy/en">Privacy policy</a>.</p>
<p>FloodShield is an independent app. It is not affiliated with, and does not represent, any government agency.</p>
"""

PAGE_BODIES = {
    "privacy": {"vi": PRIVACY_VI, "en": PRIVACY_EN},
    "support": {"vi": SUPPORT_VI, "en": SUPPORT_EN},
}
