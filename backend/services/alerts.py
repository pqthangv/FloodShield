"""Location-based alert engine.

Combines several free sources into one list of alerts for a coordinate:
- Heavy rain, intense short rain (urban flooding), strong wind, heat and landslide risk from the
  Open-Meteo forecast, using the thresholds of Vietnam's national weather service (NCHMF).
- River flood risk from GloFAS (see services/flood.py).
- Active typhoons, floods, earthquakes... from GDACS.
- Warnings entered by an administrator (ManualAlert).

The alert ids are stable (they only change when the date or the severity changes) so the
phone can avoid notifying twice for the same alert.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models.alert_model import ManualAlert
from services import flood, gdacs, osm, weather
from services.geo import haversine_km

logger = logging.getLogger(__name__)

SEVERITY_RANK = {"info": 0, "moderate": 1, "high": 2, "severe": 3}

# ThienTai ids (see seed.py) used to open the matching "what to do" checklist.
TYPE_STORM, TYPE_FLOOD, TYPE_WILDFIRE, TYPE_LANDSLIDE, TYPE_DROUGHT, TYPE_HEAT, TYPE_EARTHQUAKE = (
    1, 2, 3, 4, 5, 6, 7,
)

# Upper bounds (km/h) of Beaufort levels 0..16; Vietnam uses the extended scale up to 17.
_BEAUFORT_KMH = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118, 134, 150, 167, 184, 202]
_WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]


def beaufort(kmh: Optional[float]) -> int:
    if kmh is None:
        return 0
    return sum(1 for limit in _BEAUFORT_KMH if kmh >= limit)


def vn_day(iso_day: str) -> str:
    d = datetime.fromisoformat(iso_day[:10])
    return f"{_WEEKDAYS[d.weekday()]}, {d.day:02d}/{d.month:02d}"


def _alert(**kwargs) -> dict:
    base = {
        "starts_at": None,
        "ends_at": None,
        "distance_km": None,
        "details": [],
        "disaster_type_id": None,
        "url": None,
    }
    base.update(kwargs)
    return base


# --- Forecast-based alerts --------------------------------------------------------------


def rain_alerts(raw: dict, area: str) -> list[dict]:
    daily = raw.get("daily", {})
    days = list(zip(daily.get("time", []), daily.get("precipitation_sum", [])))[:3]
    days = [(d, mm or 0) for d, mm in days]
    if not days:
        return []

    alerts = []
    worst_day, worst_mm = max(days, key=lambda x: x[1])
    severity, label = None, None
    if worst_mm >= 200:
        severity, label = "severe", "Mưa đặc biệt to"
    elif worst_mm >= 100:
        severity, label = "high", "Mưa rất to"
    elif worst_mm >= 50:
        severity, label = "moderate", "Mưa to"
    if severity:
        alerts.append(
            _alert(
                id=f"rain-{worst_day}-{severity}",
                category="heavy_rain",
                severity=severity,
                title=f"{label} - {worst_mm:.0f} mm/ngày",
                area=area,
                description=(
                    f"Dự báo {label.lower()} vào {vn_day(worst_day)}, lượng mưa khoảng "
                    f"{worst_mm:.0f} mm. Đề phòng ngập úng ở vùng trũng thấp, lũ trên sông suối "
                    "nhỏ. Hạn chế ra đường khi mưa lớn."
                ),
                starts_at=worst_day,
                details=[{"label": vn_day(d), "value": f"{mm:.0f} mm"} for d, mm in days],
                disaster_type_id=TYPE_FLOOD,
                source="Open-Meteo",
            )
        )

    # Landslide / flash flood risk in hilly terrain.
    elevation = raw.get("elevation") or 0
    total_72h = sum(mm for _, mm in days)
    if elevation >= 150 and (worst_mm >= 100 or total_72h >= 150):
        sev = "severe" if (worst_mm >= 200 or total_72h >= 250) else "high"
        alerts.append(
            _alert(
                id=f"landslide-{worst_day}-{sev}",
                category="landslide",
                severity=sev,
                title="Nguy cơ sạt lở đất, lũ quét",
                area=area,
                description=(
                    f"Khu vực đồi núi (độ cao ~{elevation:.0f} m) có mưa lớn, tổng lượng mưa "
                    f"3 ngày khoảng {total_72h:.0f} mm. Nguy cơ cao xảy ra sạt lở đất và lũ quét. "
                    "Tránh xa sườn dốc, khe suối; sẵn sàng sơ tán khi có dấu hiệu nứt đất."
                ),
                starts_at=worst_day,
                details=[
                    {"label": "Tổng mưa 3 ngày", "value": f"{total_72h:.0f} mm"},
                    {"label": "Độ cao địa hình", "value": f"{elevation:.0f} m"},
                ],
                disaster_type_id=TYPE_LANDSLIDE,
                source="Open-Meteo",
            )
        )
    return alerts


def intense_rain_alert(raw: dict, area: str) -> Optional[dict]:
    """Short, very intense rain causes street flooding in cities even when the daily total is moderate."""
    hourly = raw.get("hourly", {})
    times = hourly.get("time", [])
    values = [v or 0 for v in hourly.get("precipitation", [])]
    now_hour = (raw.get("current", {}).get("time") or "")[:13]
    start = next((i for i, t in enumerate(times) if t[:13] >= now_hour), 0)
    best_sum, best_i = 0.0, None
    for i in range(start, min(start + 24, len(values) - 2)):
        s = values[i] + values[i + 1] + values[i + 2]
        if s > best_sum:
            best_sum, best_i = s, i
    if best_i is None or best_sum < 50:
        return None
    severity = "high" if best_sum >= 80 else "moderate"
    when = times[best_i]
    return _alert(
        id=f"urban-{when[:10]}-{severity}",
        category="urban_flood",
        severity=severity,
        title="Mưa lớn cường độ mạnh - nguy cơ ngập úng",
        area=area,
        description=(
            f"Dự báo mưa khoảng {best_sum:.0f} mm trong 3 giờ, bắt đầu từ {when[11:16]} "
            f"{vn_day(when)}. Nhiều tuyến đường có thể bị ngập. Không đi qua đoạn đường ngập sâu, "
            "nước chảy xiết; ngắt điện nếu nước tràn vào nhà."
        ),
        starts_at=when,
        details=[{"label": "Lượng mưa 3 giờ", "value": f"{best_sum:.0f} mm"}],
        disaster_type_id=TYPE_FLOOD,
        source="Open-Meteo",
    )


def wind_alert(raw: dict, area: str) -> Optional[dict]:
    daily = raw.get("daily", {})
    rows = list(
        zip(daily.get("time", []), daily.get("wind_speed_10m_max", []), daily.get("wind_gusts_10m_max", []))
    )[:3]
    if not rows:
        return None
    day, wind, gust = max(rows, key=lambda r: r[2] or 0)
    level = beaufort(gust)
    if level >= 12:
        severity = "severe"
    elif level >= 10:
        severity = "high"
    elif level >= 8:
        severity = "moderate"
    else:
        return None
    return _alert(
        id=f"wind-{day}-{severity}",
        category="wind",
        severity=severity,
        title=f"Gió mạnh cấp {beaufort(wind)}, giật cấp {level}",
        area=area,
        description=(
            f"Dự báo gió giật tới {gust:.0f} km/h vào {vn_day(day)}. Chằng chống nhà cửa, "
            "tránh xa cây cao, biển quảng cáo, cột điện. Không ra khơi."
        ),
        starts_at=day,
        details=[
            {"label": "Gió mạnh nhất", "value": f"{wind:.0f} km/h (cấp {beaufort(wind)})"},
            {"label": "Gió giật", "value": f"{gust:.0f} km/h (cấp {level})"},
        ],
        disaster_type_id=TYPE_STORM,
        source="Open-Meteo",
    )


def heat_alert(raw: dict, area: str) -> Optional[dict]:
    daily = raw.get("daily", {})
    rows = list(zip(daily.get("time", []), daily.get("temperature_2m_max", [])))[:3]
    rows = [(d, t) for d, t in rows if t is not None]
    if not rows:
        return None
    day, temp = max(rows, key=lambda r: r[1])
    if temp >= 39:
        severity, label = "high", "Nắng nóng đặc biệt gay gắt"
    elif temp >= 37:
        severity, label = "moderate", "Nắng nóng gay gắt"
    elif temp >= 35:
        severity, label = "info", "Nắng nóng"
    else:
        return None
    return _alert(
        id=f"heat-{day}-{severity}",
        category="heat",
        severity=severity,
        title=f"{label} - {temp:.0f}°C",
        area=area,
        description=(
            f"Nhiệt độ cao nhất dự báo khoảng {temp:.0f}°C vào {vn_day(day)}. Uống đủ nước, "
            "hạn chế ra ngoài từ 11h đến 15h, chú ý người già và trẻ nhỏ."
        ),
        starts_at=day,
        details=[{"label": "Nhiệt độ cao nhất", "value": f"{temp:.0f}°C"}],
        disaster_type_id=TYPE_HEAT,
        source="Open-Meteo",
    )


def flood_alert(outlook: dict, area: str) -> Optional[dict]:
    risk = outlook.get("risk")
    if risk not in ("watch", "moderate", "high", "severe"):
        return None
    severity = "info" if risk == "watch" else risk
    river = outlook["river"]
    thr = outlook.get("thresholds") or {}
    peak = outlook.get("peak") or {}
    details = [{"label": "Khoảng cách đến sông", "value": f"{river['distance_km']} km"}]
    if peak:
        details.append(
            {"label": "Lưu lượng đỉnh dự báo", "value": f"{peak['discharge']:,.0f} m³/s ({vn_day(peak['date'])})"}
        )
    if thr:
        details.append({"label": "Mức lũ chu kỳ 2 năm", "value": f"{thr['rp2']:,.0f} m³/s"})
        details.append({"label": "Mức lũ chu kỳ 20 năm", "value": f"{thr['rp20']:,.0f} m³/s"})
    title = {
        "watch": "Theo dõi mực nước sông",
        "moderate": "Cảnh báo lũ trên sông gần bạn",
        "high": "Lũ lớn trên sông gần bạn",
        "severe": "Lũ rất lớn trên sông gần bạn",
    }[risk]
    return _alert(
        id=f"flood-{river['latitude']}-{river['longitude']}-{severity}-{(peak.get('date') or '')[:7]}",
        category="flood",
        severity=severity,
        title=title,
        area=area,
        description=outlook.get("summary", ""),
        starts_at=peak.get("date"),
        distance_km=river["distance_km"],
        details=details,
        disaster_type_id=TYPE_FLOOD,
        source="GloFAS (Copernicus) qua Open-Meteo",
    )


# --- GDACS ------------------------------------------------------------------------------

_GDACS_SEVERITY = {"green": "moderate", "orange": "high", "red": "severe"}
_COUNTRY_VI = {"Viet Nam": "Việt Nam", "Vietnam": "Việt Nam", "Laos": "Lào", "Cambodia": "Campuchia",
               "China": "Trung Quốc", "Philippines": "Philippines", "Thailand": "Thái Lan"}


def gdacs_alerts(events: list[dict], lat: float, lon: float) -> list[dict]:
    alerts = []
    for feature in events:
        props = feature.get("properties", {})
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        distance = haversine_km(lat, lon, coords[1], coords[0])
        etype = props.get("eventtype")
        level = str(props.get("alertlevel", "Green")).lower()
        severity = _GDACS_SEVERITY.get(level, "moderate")
        countries = [c.get("iso3") for c in props.get("affectedcountries") or []]
        in_vietnam = "VNM" in countries or props.get("iso3") == "VNM"
        country = _COUNTRY_VI.get(props.get("country", ""), props.get("country", ""))
        sev_text = (props.get("severitydata") or {}).get("severitytext", "")
        name = props.get("eventname") or ""

        if etype == "TC":
            if distance > 1500 or (level == "green" and distance > 700):
                continue
            title = f"Bão {name}" if name else "Bão / áp thấp nhiệt đới"
            description = (
                f"{title} đang ở cách bạn khoảng {distance:,.0f} km. Theo dõi tin bão chính thức "
                "từ Trung tâm Dự báo KTTV Quốc gia (nchmf.gov.vn) và chuẩn bị phương án phòng tránh."
            )
            type_id, category = TYPE_STORM, "storm"
        elif etype == "FL":
            if not (in_vietnam or distance <= 300):
                continue
            title = f"Lũ lụt tại {country}" if country else "Lũ lụt"
            description = f"GDACS ghi nhận lũ lụt cách bạn khoảng {distance:,.0f} km."
            type_id, category = TYPE_FLOOD, "flood"
        elif etype == "EQ":
            magnitude = (props.get("severitydata") or {}).get("severity") or 0
            if distance > 300 or (level == "green" and magnitude < 5):
                continue
            title = f"Động đất {magnitude:.1f} độ richter"
            description = f"Động đất xảy ra cách bạn khoảng {distance:,.0f} km. Đề phòng dư chấn."
            type_id, category = TYPE_EARTHQUAKE, "earthquake"
        elif etype == "DR":
            if not in_vietnam:
                continue
            title, description = "Hạn hán", "GDACS ghi nhận tình trạng hạn hán trong khu vực."
            type_id, category = TYPE_DROUGHT, "drought"
        elif etype == "WF":
            if distance > 100:
                continue
            title = "Cháy rừng"
            description = f"Phát hiện cháy rừng cách bạn khoảng {distance:,.0f} km."
            type_id, category = TYPE_WILDFIRE, "wildfire"
        elif etype == "VO":
            if distance > 300:
                continue
            title, description = "Núi lửa hoạt động", f"Núi lửa hoạt động cách bạn khoảng {distance:,.0f} km."
            type_id, category = None, "volcano"
        else:
            continue

        details = [{"label": "Khoảng cách", "value": f"{distance:,.0f} km"}]
        if sev_text:
            details.append({"label": "Cường độ", "value": sev_text})
        details.append({"label": "Cấp cảnh báo GDACS", "value": level.capitalize()})
        alerts.append(
            _alert(
                id=f"gdacs-{etype}-{props.get('eventid')}-{level}",
                category=category,
                severity=severity,
                title=title,
                area=country or "Khu vực lân cận",
                description=description,
                starts_at=props.get("fromdate"),
                ends_at=props.get("todate"),
                distance_km=round(distance, 1),
                details=details,
                disaster_type_id=type_id,
                url=(props.get("url") or {}).get("report"),
                source="GDACS",
            )
        )
    return alerts


# --- Manual alerts ----------------------------------------------------------------------


async def manual_alerts(db: AsyncSession, lat: float, lon: float) -> list[dict]:
    now = datetime.now(timezone.utc)
    rows = (await db.execute(select(ManualAlert))).scalars().all()
    alerts = []
    for a in rows:
        starts = _aware(a.starts_at)
        ends = _aware(a.ends_at)
        if (starts and starts > now) or (ends and ends < now):
            continue
        distance = haversine_km(lat, lon, a.latitude, a.longitude)
        if distance > a.radius_km:
            continue
        alerts.append(
            _alert(
                id=f"manual-{a.id}",
                category=a.category,
                severity=a.severity,
                title=a.title,
                area=a.area or "Khu vực của bạn",
                description=a.description,
                starts_at=starts.isoformat() if starts else None,
                ends_at=ends.isoformat() if ends else None,
                distance_km=round(distance, 1),
                disaster_type_id=_type_for_category(a.category),
                source=a.source or "FloodShield",
            )
        )
    return alerts


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _type_for_category(category: str) -> Optional[int]:
    return {
        "storm": TYPE_STORM,
        "wind": TYPE_STORM,
        "flood": TYPE_FLOOD,
        "heavy_rain": TYPE_FLOOD,
        "urban_flood": TYPE_FLOOD,
        "landslide": TYPE_LANDSLIDE,
        "wildfire": TYPE_WILDFIRE,
        "drought": TYPE_DROUGHT,
        "heat": TYPE_HEAT,
        "earthquake": TYPE_EARTHQUAKE,
    }.get(category)


# --- Entry point ------------------------------------------------------------------------


async def build_alerts(db: AsyncSession, lat: float, lon: float) -> list[dict]:
    raw, outlook, events, place = await asyncio.gather(
        weather.fetch_raw_forecast(lat, lon),
        flood.get_flood_outlook(db, lat, lon),
        gdacs.fetch_events(),
        osm.reverse_geocode(lat, lon),
        return_exceptions=True,
    )
    area = place["display"] if isinstance(place, dict) and place.get("display") else "Khu vực của bạn"

    alerts: list[dict] = []
    if isinstance(raw, Exception):
        logger.warning(f"Forecast unavailable for alerts: {raw}")
    else:
        alerts += rain_alerts(raw, area)
        alerts += [a for a in (intense_rain_alert(raw, area), wind_alert(raw, area), heat_alert(raw, area)) if a]
    if isinstance(outlook, Exception):
        logger.warning(f"Flood outlook unavailable for alerts: {outlook}")
    else:
        a = flood_alert(outlook, area)
        if a:
            alerts.append(a)
    if not isinstance(events, Exception):
        alerts += gdacs_alerts(events, lat, lon)
    alerts += await manual_alerts(db, lat, lon)

    alerts.sort(key=lambda a: (-SEVERITY_RANK.get(a["severity"], 0), a["distance_km"] or 0))
    return alerts
