"""Translations for the text the API generates (alerts, weather, flood summaries, errors).

The app sends its language in the standard `Accept-Language` header ("vi" or "en").
Vietnamese is the default. Content written by people - community posts and alerts entered by an
administrator - is returned as written.
"""

from datetime import datetime
from typing import Literal, Optional
from fastapi import Header

Lang = Literal["vi", "en"]


def pick_lang(accept_language: Optional[str]) -> Lang:
    return "en" if accept_language and accept_language.strip().lower().startswith("en") else "vi"


async def get_lang(accept_language: Optional[str] = Header(None)) -> Lang:
    """FastAPI dependency: the language of the request."""
    return pick_lang(accept_language)


def t(lang: Lang, key: str, **kwargs) -> str:
    entry = MESSAGES[key]
    text = entry.get(lang) or entry["vi"]
    return text.format(**kwargs) if kwargs else text


_WEEKDAYS = {
    "vi": ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"],
    "en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
}
_MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def day_label(iso_day: str, lang: Lang) -> str:
    """"2026-10-05" -> "Thứ 2, 05/10" or "Mon 5 Oct"."""
    d = datetime.fromisoformat(iso_day[:10])
    weekday = _WEEKDAYS[lang][d.weekday()]
    if lang == "en":
        return f"{weekday} {d.day} {_MONTHS_EN[d.month - 1]}"
    return f"{weekday}, {d.day:02d}/{d.month:02d}"


def short_date(iso_day: str, lang: Lang) -> str:
    """"2026-10-05" -> "05/10" or "5 Oct"."""
    d = datetime.fromisoformat(iso_day[:10])
    return f"{d.day} {_MONTHS_EN[d.month - 1]}" if lang == "en" else f"{d.day:02d}/{d.month:02d}"


MESSAGES: dict[str, dict[str, str]] = {
    # --- General ---------------------------------------------------------------------------
    "your_location": {"vi": "Vị trí của bạn", "en": "Your location"},
    "your_area": {"vi": "Khu vực của bạn", "en": "Your area"},
    "nearby_region": {"vi": "Khu vực lân cận", "en": "Nearby region"},
    # --- Errors ----------------------------------------------------------------------------
    "err_weather": {"vi": "Không thể tải dữ liệu thời tiết", "en": "Could not load the weather data"},
    "err_forecast_invalid": {"vi": "Dữ liệu dự báo không hợp lệ", "en": "Invalid forecast data"},
    "err_alerts": {"vi": "Chưa kiểm tra được cảnh báo, vui lòng thử lại sau", "en": "Could not check for alerts, please try again later"},
    "err_flood": {"vi": "Không thể tải dữ liệu lũ", "en": "Could not load the flood data"},
    "err_place": {"vi": "Không xác định được địa danh", "en": "Could not find the place name"},
    "err_search": {"vi": "Không thể tìm kiếm địa điểm", "en": "Could not search for places"},
    "err_device_id": {"vi": "Thiếu mã thiết bị (X-Device-Id)", "en": "Missing device id (X-Device-Id)"},
    "err_bad_image": {"vi": "Ảnh không hợp lệ", "en": "The image is not valid"},
    "err_image_not_found": {"vi": "Không tìm thấy ảnh", "en": "Image not found"},
    "err_too_many_posts": {
        "vi": "Bạn đã gửi quá nhiều báo cáo. Vui lòng thử lại sau.",
        "en": "You have sent too many reports. Please try again later.",
    },
    "err_image_too_large": {"vi": "Ảnh tối đa {mb} MB", "en": "Images can be at most {mb} MB"},
    "err_post_not_found": {"vi": "Không tìm thấy bài viết", "en": "Post not found"},
    "err_not_your_post": {
        "vi": "Bạn chỉ có thể xóa bài viết của mình",
        "en": "You can only delete your own posts",
    },
    # --- Shelters --------------------------------------------------------------------------
    "kind_assembly_point": {"vi": "Điểm tập kết sơ tán", "en": "Evacuation assembly point"},
    "kind_shelter": {"vi": "Nhà tránh trú", "en": "Shelter"},
    "kind_school": {"vi": "Trường học", "en": "School"},
    "kind_university": {"vi": "Trường đại học", "en": "University"},
    "kind_college": {"vi": "Trường cao đẳng", "en": "College"},
    "kind_community_centre": {"vi": "Nhà văn hóa", "en": "Community centre"},
    "kind_townhall": {"vi": "Trụ sở UBND", "en": "People's Committee office"},
    "kind_hospital": {"vi": "Bệnh viện", "en": "Hospital"},
    "kind_fire_station": {"vi": "Đội PCCC", "en": "Fire station"},
    "kind_police": {"vi": "Công an", "en": "Police station"},
    "kind_other": {"vi": "Nơi trú ẩn", "en": "Shelter"},
    "kind_official": {"vi": "Điểm sơ tán", "en": "Evacuation point"},
    "source_local_authorities": {"vi": "Chính quyền địa phương", "en": "Local authorities"},
    # --- Flood outlook ---------------------------------------------------------------------
    "risk_none": {"vi": "Bình thường", "en": "Normal"},
    "risk_watch": {"vi": "Theo dõi", "en": "Watch"},
    "risk_moderate": {"vi": "Cảnh báo lũ", "en": "Flood warning"},
    "risk_high": {"vi": "Nguy hiểm", "en": "Dangerous"},
    "risk_severe": {"vi": "Rất nguy hiểm", "en": "Very dangerous"},
    "risk_unknown": {"vi": "Không có dữ liệu", "en": "No data"},
    "flood_no_river": {
        "vi": "Không tìm thấy sông lớn trong bán kính khoảng 15 km quanh vị trí của bạn.",
        "en": "No large river was found within about 15 km of your location.",
    },
    "flood_no_history": {
        "vi": "Chưa đủ dữ liệu lịch sử để đánh giá nguy cơ lũ cho sông gần bạn.",
        "en": "There is not enough historical data yet to assess the flood risk of the river near you.",
    },
    "flood_normal": {
        "vi": "Mực nước sông gần bạn dự kiến ở mức bình thường trong 10 ngày tới.",
        "en": "The river near you is expected to stay at normal levels for the next 10 days.",
    },
    "flood_watch": {
        "vi": "Có khả năng (thấp) lưu lượng sông vượt mức báo động. Tiếp tục theo dõi.",
        "en": "There is a (low) chance the river rises above its flood level. Keep watching.",
    },
    "flood_exceeds": {
        "vi": "Lưu lượng sông dự kiến đạt khoảng {flow} m³/s vào ngày {date}, vượt mức lũ chu kỳ {years} năm.",
        "en": "The river is expected to reach about {flow} m³/s on {date}, above its {years}-year flood level.",
    },
    # --- Alerts: rain ----------------------------------------------------------------------
    "rain_extreme": {"vi": "Mưa đặc biệt to", "en": "Extremely heavy rain"},
    "rain_very_heavy": {"vi": "Mưa rất to", "en": "Very heavy rain"},
    "rain_heavy": {"vi": "Mưa to", "en": "Heavy rain"},
    "rain_title": {"vi": "{label} - {mm} mm/ngày", "en": "{label} - {mm} mm/day"},
    "rain_desc": {
        "vi": "Dự báo {label_lower} vào {day}, lượng mưa khoảng {mm} mm. Đề phòng ngập úng ở vùng "
        "trũng thấp, lũ trên sông suối nhỏ. Hạn chế ra đường khi mưa lớn.",
        "en": "{label} is forecast for {day}, about {mm} mm. Watch for flooding in low-lying areas "
        "and on small rivers and streams. Avoid travelling during heavy rain.",
    },
    "landslide_title": {"vi": "Nguy cơ sạt lở đất, lũ quét", "en": "Risk of landslides and flash floods"},
    "landslide_desc": {
        "vi": "Khu vực đồi núi (độ cao ~{elevation} m) có mưa lớn, tổng lượng mưa 3 ngày khoảng "
        "{total} mm. Nguy cơ cao xảy ra sạt lở đất và lũ quét. Tránh xa sườn dốc, khe suối; sẵn "
        "sàng sơ tán khi có dấu hiệu nứt đất.",
        "en": "Heavy rain in hilly terrain (elevation ~{elevation} m), about {total} mm over 3 days. "
        "High risk of landslides and flash floods. Stay away from steep slopes and streams, and be "
        "ready to evacuate if cracks appear in the ground.",
    },
    "detail_rain_3days": {"vi": "Tổng mưa 3 ngày", "en": "Rain over 3 days"},
    "detail_elevation": {"vi": "Độ cao địa hình", "en": "Elevation"},
    "urban_title": {
        "vi": "Mưa lớn cường độ mạnh - nguy cơ ngập úng",
        "en": "Intense rain - risk of street flooding",
    },
    "urban_desc": {
        "vi": "Dự báo mưa khoảng {mm} mm trong 3 giờ, bắt đầu từ {time} {day}. Nhiều tuyến đường có "
        "thể bị ngập. Không đi qua đoạn đường ngập sâu, nước chảy xiết; ngắt điện nếu nước tràn vào nhà.",
        "en": "About {mm} mm of rain is forecast within 3 hours, starting at {time} on {day}. Many "
        "streets may flood. Do not cross deep or fast-flowing water, and switch off the power if "
        "water enters your home.",
    },
    "detail_rain_3h": {"vi": "Lượng mưa 3 giờ", "en": "Rain in 3 hours"},
    # --- Alerts: wind and heat -------------------------------------------------------------
    "wind_title": {
        "vi": "Gió mạnh cấp {wind}, giật cấp {gust}",
        "en": "Strong wind: Beaufort {wind}, gusts {gust}",
    },
    "wind_desc": {
        "vi": "Dự báo gió giật tới {kmh} km/h vào {day}. Chằng chống nhà cửa, tránh xa cây cao, "
        "biển quảng cáo, cột điện. Không ra khơi.",
        "en": "Gusts up to {kmh} km/h are forecast for {day}. Secure your home and stay away from "
        "tall trees, billboards and power poles. Do not go out to sea.",
    },
    "detail_strongest_wind": {"vi": "Gió mạnh nhất", "en": "Strongest wind"},
    "detail_gusts": {"vi": "Gió giật", "en": "Gusts"},
    "beaufort_value": {"vi": "{kmh} km/h (cấp {level})", "en": "{kmh} km/h (Beaufort {level})"},
    "heat_extreme": {"vi": "Nắng nóng đặc biệt gay gắt", "en": "Extreme heat"},
    "heat_severe": {"vi": "Nắng nóng gay gắt", "en": "Severe heat"},
    "heat_hot": {"vi": "Nắng nóng", "en": "Hot weather"},
    "heat_title": {"vi": "{label} - {temp}°C", "en": "{label} - {temp}°C"},
    "heat_desc": {
        "vi": "Nhiệt độ cao nhất dự báo khoảng {temp}°C vào {day}. Uống đủ nước, hạn chế ra ngoài "
        "từ 11h đến 15h, chú ý người già và trẻ nhỏ.",
        "en": "The highest temperature is forecast to reach about {temp}°C on {day}. Drink plenty "
        "of water, avoid going out between 11:00 and 15:00, and look after older people and children.",
    },
    "detail_max_temp": {"vi": "Nhiệt độ cao nhất", "en": "Maximum temperature"},
    # --- Alerts: river floods --------------------------------------------------------------
    "flood_title_watch": {"vi": "Theo dõi mực nước sông", "en": "Watch river levels"},
    "flood_title_moderate": {"vi": "Cảnh báo lũ trên sông gần bạn", "en": "Flood warning for a river near you"},
    "flood_title_high": {"vi": "Lũ lớn trên sông gần bạn", "en": "Major flood on a river near you"},
    "flood_title_severe": {"vi": "Lũ rất lớn trên sông gần bạn", "en": "Severe flood on a river near you"},
    "detail_river_distance": {"vi": "Khoảng cách đến sông", "en": "Distance to the river"},
    "detail_peak_flow": {"vi": "Lưu lượng đỉnh dự báo", "en": "Forecast peak flow"},
    "detail_rp2": {"vi": "Mức lũ chu kỳ 2 năm", "en": "2-year flood level"},
    "detail_rp20": {"vi": "Mức lũ chu kỳ 20 năm", "en": "20-year flood level"},
    "source_glofas": {"vi": "GloFAS (Copernicus) qua Open-Meteo", "en": "GloFAS (Copernicus) via Open-Meteo"},
    # --- Alerts: GDACS ---------------------------------------------------------------------
    "tc_title": {"vi": "Bão {name}", "en": "Tropical cyclone {name}"},
    "tc_title_unnamed": {"vi": "Bão / áp thấp nhiệt đới", "en": "Tropical storm or depression"},
    "tc_desc": {
        "vi": "{title} đang ở cách bạn khoảng {km} km. Theo dõi tin bão chính thức từ Trung tâm Dự "
        "báo KTTV Quốc gia (nchmf.gov.vn) và chuẩn bị phương án phòng tránh.",
        "en": "{title} is about {km} km away. Follow the official storm bulletins of Vietnam's "
        "National Center for Hydro-Meteorological Forecasting (nchmf.gov.vn) and prepare to take shelter.",
    },
    "fl_title": {"vi": "Lũ lụt tại {country}", "en": "Flooding in {country}"},
    "fl_title_unnamed": {"vi": "Lũ lụt", "en": "Flooding"},
    "fl_desc": {
        "vi": "GDACS ghi nhận lũ lụt cách bạn khoảng {km} km.",
        "en": "GDACS reports flooding about {km} km from you.",
    },
    "eq_title": {"vi": "Động đất {mag} độ richter", "en": "Magnitude {mag} earthquake"},
    "eq_desc": {
        "vi": "Động đất xảy ra cách bạn khoảng {km} km. Đề phòng dư chấn.",
        "en": "An earthquake occurred about {km} km from you. Be prepared for aftershocks.",
    },
    "dr_title": {"vi": "Hạn hán", "en": "Drought"},
    "dr_desc": {
        "vi": "GDACS ghi nhận tình trạng hạn hán trong khu vực.",
        "en": "GDACS reports drought conditions in the region.",
    },
    "wf_title": {"vi": "Cháy rừng", "en": "Wildfire"},
    "wf_desc": {
        "vi": "Phát hiện cháy rừng cách bạn khoảng {km} km.",
        "en": "A wildfire was detected about {km} km from you.",
    },
    "vo_title": {"vi": "Núi lửa hoạt động", "en": "Volcanic activity"},
    "vo_desc": {
        "vi": "Núi lửa hoạt động cách bạn khoảng {km} km.",
        "en": "Volcanic activity about {km} km from you.",
    },
    "detail_distance": {"vi": "Khoảng cách", "en": "Distance"},
    "detail_intensity": {"vi": "Cường độ", "en": "Intensity"},
    "detail_gdacs_level": {"vi": "Cấp cảnh báo GDACS", "en": "GDACS alert level"},
}

# Country names GDACS uses -> Vietnamese.
COUNTRY_VI = {
    "Viet Nam": "Việt Nam",
    "Vietnam": "Việt Nam",
    "Laos": "Lào",
    "Cambodia": "Campuchia",
    "China": "Trung Quốc",
    "Philippines": "Philippines",
    "Thailand": "Thái Lan",
}
