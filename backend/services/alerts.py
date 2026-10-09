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
from i18n import COUNTRY_VI, Lang, day_label, t
from models.alert_model import ManualAlert
from services import flood, gdacs, osm, weather
from services.cache import cache
from services.geo import haversine_km

logger = logging.getLogger(__name__)

SEVERITY_RANK = {"info": 0, "moderate": 1, "high": 2, "severe": 3}

# ThienTai ids (see seed.py) used to open the matching "what to do" checklist.
TYPE_STORM, TYPE_FLOOD, TYPE_WILDFIRE, TYPE_LANDSLIDE, TYPE_DROUGHT, TYPE_HEAT, TYPE_EARTHQUAKE = (
    1, 2, 3, 4, 5, 6, 7,
)

# Upper bounds (km/h) of Beaufort levels 0..16; Vietnam uses the extended scale up to 17.
_BEAUFORT_KMH = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118, 134, 150, 167, 184, 202]


def beaufort(kmh: Optional[float]) -> int:
    if kmh is None:
        return 0
    return sum(1 for limit in _BEAUFORT_KMH if kmh >= limit)


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


def rain_alerts(raw: dict, area: str, lang: Lang = "vi") -> list[dict]:
    daily = raw.get("daily", {})
    days = list(zip(daily.get("time", []), daily.get("precipitation_sum", [])))[:3]
    days = [(d, mm or 0) for d, mm in days]
    if not days:
        return []

    alerts = []
    worst_day, worst_mm = max(days, key=lambda x: x[1])
    severity, label = None, None
    if worst_mm >= 200:
        severity, label = "severe", t(lang, "rain_extreme")
    elif worst_mm >= 100:
        severity, label = "high", t(lang, "rain_very_heavy")
    elif worst_mm >= 50:
        severity, label = "moderate", t(lang, "rain_heavy")
    if severity:
        mm = f"{worst_mm:.0f}"
        alerts.append(
            _alert(
                id=f"rain-{worst_day}-{severity}",
                category="heavy_rain",
                severity=severity,
                title=t(lang, "rain_title", label=label, mm=mm),
                area=area,
                description=t(
                    lang,
                    "rain_desc",
                    label=label,
                    label_lower=label.lower(),
                    day=day_label(worst_day, lang),
                    mm=mm,
                ),
                starts_at=worst_day,
                details=[{"label": day_label(d, lang), "value": f"{v:.0f} mm"} for d, v in days],
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
                title=t(lang, "landslide_title"),
                area=area,
                description=t(
                    lang, "landslide_desc", elevation=f"{elevation:.0f}", total=f"{total_72h:.0f}"
                ),
                starts_at=worst_day,
                details=[
                    {"label": t(lang, "detail_rain_3days"), "value": f"{total_72h:.0f} mm"},
                    {"label": t(lang, "detail_elevation"), "value": f"{elevation:.0f} m"},
                ],
                disaster_type_id=TYPE_LANDSLIDE,
                source="Open-Meteo",
            )
        )
    return alerts


def intense_rain_alert(raw: dict, area: str, lang: Lang = "vi") -> Optional[dict]:
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
        title=t(lang, "urban_title"),
        area=area,
        description=t(
            lang, "urban_desc", mm=f"{best_sum:.0f}", time=when[11:16], day=day_label(when, lang)
        ),
        starts_at=when,
        details=[{"label": t(lang, "detail_rain_3h"), "value": f"{best_sum:.0f} mm"}],
        disaster_type_id=TYPE_FLOOD,
        source="Open-Meteo",
    )


def wind_alert(raw: dict, area: str, lang: Lang = "vi") -> Optional[dict]:
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
        title=t(lang, "wind_title", wind=beaufort(wind), gust=level),
        area=area,
        description=t(lang, "wind_desc", kmh=f"{gust:.0f}", day=day_label(day, lang)),
        starts_at=day,
        details=[
            {
                "label": t(lang, "detail_strongest_wind"),
                "value": t(lang, "beaufort_value", kmh=f"{wind:.0f}", level=beaufort(wind)),
            },
            {
                "label": t(lang, "detail_gusts"),
                "value": t(lang, "beaufort_value", kmh=f"{gust:.0f}", level=level),
            },
        ],
        disaster_type_id=TYPE_STORM,
        source="Open-Meteo",
    )


def heat_alert(raw: dict, area: str, lang: Lang = "vi") -> Optional[dict]:
    daily = raw.get("daily", {})
    rows = list(zip(daily.get("time", []), daily.get("temperature_2m_max", [])))[:3]
    rows = [(d, t) for d, t in rows if t is not None]
    if not rows:
        return None
    day, temp = max(rows, key=lambda r: r[1])
    if temp >= 39:
        severity, label = "high", t(lang, "heat_extreme")
    elif temp >= 37:
        severity, label = "moderate", t(lang, "heat_severe")
    elif temp >= 35:
        severity, label = "info", t(lang, "heat_hot")
    else:
        return None
    return _alert(
        id=f"heat-{day}-{severity}",
        category="heat",
        severity=severity,
        title=t(lang, "heat_title", label=label, temp=f"{temp:.0f}"),
        area=area,
        description=t(lang, "heat_desc", temp=f"{temp:.0f}", day=day_label(day, lang)),
        starts_at=day,
        details=[{"label": t(lang, "detail_max_temp"), "value": f"{temp:.0f}°C"}],
        disaster_type_id=TYPE_HEAT,
        source="Open-Meteo",
    )


def flood_alert(outlook: dict, area: str, lang: Lang = "vi") -> Optional[dict]:
    risk = outlook.get("risk")
    if risk not in ("watch", "moderate", "high", "severe"):
        return None
    severity = "info" if risk == "watch" else risk
    river = outlook["river"]
    thr = outlook.get("thresholds") or {}
    peak = outlook.get("peak") or {}
    details = [{"label": t(lang, "detail_river_distance"), "value": f"{river['distance_km']} km"}]
    if peak:
        details.append(
            {
                "label": t(lang, "detail_peak_flow"),
                "value": f"{peak['discharge']:,.0f} m³/s ({day_label(peak['date'], lang)})",
            }
        )
    if thr:
        details.append({"label": t(lang, "detail_rp2"), "value": f"{thr['rp2']:,.0f} m³/s"})
        details.append({"label": t(lang, "detail_rp20"), "value": f"{thr['rp20']:,.0f} m³/s"})
    title = t(lang, f"flood_title_{risk}")
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
        source=t(lang, "source_glofas"),
    )


# --- GDACS ------------------------------------------------------------------------------

_GDACS_SEVERITY = {"green": "moderate", "orange": "high", "red": "severe"}


def gdacs_alerts(events: list[dict], lat: float, lon: float, lang: Lang = "vi") -> list[dict]:
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
        country = props.get("country", "")
        if lang == "vi":
            country = COUNTRY_VI.get(country, country)
        km = f"{distance:,.0f}"
        sev_text = (props.get("severitydata") or {}).get("severitytext", "")
        name = props.get("eventname") or ""

        if etype == "TC":
            if distance > 1500 or (level == "green" and distance > 700):
                continue
            title = t(lang, "tc_title", name=name) if name else t(lang, "tc_title_unnamed")
            description = t(lang, "tc_desc", title=title, km=km)
            type_id, category = TYPE_STORM, "storm"
        elif etype == "FL":
            if not (in_vietnam or distance <= 300):
                continue
            title = t(lang, "fl_title", country=country) if country else t(lang, "fl_title_unnamed")
            description = t(lang, "fl_desc", km=km)
            type_id, category = TYPE_FLOOD, "flood"
        elif etype == "EQ":
            magnitude = (props.get("severitydata") or {}).get("severity") or 0
            if distance > 300 or (level == "green" and magnitude < 5):
                continue
            title = t(lang, "eq_title", mag=f"{magnitude:.1f}")
            description = t(lang, "eq_desc", km=km)
            type_id, category = TYPE_EARTHQUAKE, "earthquake"
        elif etype == "DR":
            if not in_vietnam:
                continue
            title, description = t(lang, "dr_title"), t(lang, "dr_desc")
            type_id, category = TYPE_DROUGHT, "drought"
        elif etype == "WF":
            if distance > 100:
                continue
            title = t(lang, "wf_title")
            description = t(lang, "wf_desc", km=km)
            type_id, category = TYPE_WILDFIRE, "wildfire"
        elif etype == "VO":
            if distance > 300:
                continue
            title, description = t(lang, "vo_title"), t(lang, "vo_desc", km=km)
            type_id, category = None, "volcano"
        else:
            continue

        details = [{"label": t(lang, "detail_distance"), "value": f"{km} km"}]
        if sev_text:
            details.append({"label": t(lang, "detail_intensity"), "value": sev_text})
        details.append({"label": t(lang, "detail_gdacs_level"), "value": level.capitalize()})
        alerts.append(
            _alert(
                id=f"gdacs-{etype}-{props.get('eventid')}-{level}",
                category=category,
                severity=severity,
                title=title,
                area=country or t(lang, "nearby_region"),
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


MANUAL_ALERTS_KEY = "manual_alerts"


def forget_manual_alerts():
    """Call after an administrator adds or removes an alert, so it shows at once."""
    cache.delete(MANUAL_ALERTS_KEY)


async def _manual_alert_rows(db: AsyncSession) -> list[dict]:
    # Every alert check from every phone reads these, and they rarely change. Keeping them for
    # 3 minutes lets the database (Neon's free plan bills the hours it is awake) go to sleep.
    async def load():
        rows = (await db.execute(select(ManualAlert))).scalars().all()
        return [
            {
                "id": a.id, "category": a.category, "severity": a.severity, "title": a.title,
                "area": a.area, "description": a.description, "source": a.source,
                "latitude": a.latitude, "longitude": a.longitude, "radius_km": a.radius_km,
                "starts_at": _aware(a.starts_at), "ends_at": _aware(a.ends_at),
            }
            for a in rows
        ]

    return await cache.get_or_set(MANUAL_ALERTS_KEY, 180, load)


async def manual_alerts(db: AsyncSession, lat: float, lon: float, lang: Lang = "vi") -> list[dict]:
    """Alerts written by an administrator are returned as written (not translated)."""
    now = datetime.now(timezone.utc)
    alerts = []
    for a in await _manual_alert_rows(db):
        starts, ends = a["starts_at"], a["ends_at"]
        if (starts and starts > now) or (ends and ends < now):
            continue
        distance = haversine_km(lat, lon, a["latitude"], a["longitude"])
        if distance > a["radius_km"]:
            continue
        alerts.append(
            _alert(
                id=f"manual-{a['id']}",
                category=a["category"],
                severity=a["severity"],
                title=a["title"],
                area=a["area"] or t(lang, "your_area"),
                description=a["description"],
                starts_at=starts.isoformat() if starts else None,
                ends_at=ends.isoformat() if ends else None,
                distance_km=round(distance, 1),
                disaster_type_id=_type_for_category(a["category"]),
                source=a["source"] or "FloodShield",
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


class AlertsUnavailable(Exception):
    pass


async def _given(value):
    return value


async def build_alerts(
    db: AsyncSession, lat: float, lon: float, lang: Lang = "vi", raw: Optional[dict] = None
) -> list[dict]:
    """`raw`: an Open-Meteo forecast the app downloaded itself; otherwise this server fetches it."""
    raw, outlook, events, place = await asyncio.gather(
        _given(raw) if raw is not None else weather.fetch_raw_forecast(lat, lon),
        flood.get_flood_outlook(db, lat, lon, lang),
        gdacs.fetch_events(),
        osm.reverse_geocode(lat, lon, lang),
        return_exceptions=True,
    )
    area = place["display"] if isinstance(place, dict) and place.get("display") else t(lang, "your_area")

    alerts: list[dict] = []
    if isinstance(raw, Exception):
        logger.warning(f"Forecast unavailable for alerts: {raw}")
    else:
        alerts += rain_alerts(raw, area, lang)
        alerts += [
            a
            for a in (
                intense_rain_alert(raw, area, lang),
                wind_alert(raw, area, lang),
                heat_alert(raw, area, lang),
            )
            if a
        ]
    if isinstance(outlook, Exception):
        logger.warning(f"Flood outlook unavailable for alerts: {outlook}")
    else:
        a = flood_alert(outlook, area, lang)
        if a:
            alerts.append(a)
    if not isinstance(events, Exception):
        alerts += gdacs_alerts(events, lat, lon, lang)
    alerts += await manual_alerts(db, lat, lon, lang)

    # Without the forecast we can't say there are no alerts: rain and wind warnings would be
    # missing. Fail instead, so the app says "could not load alerts" and the phone retries.
    # Alerts from other sources (an evacuation order...) are still returned.
    if isinstance(raw, Exception) and not alerts:
        raise AlertsUnavailable("weather forecast unavailable")

    alerts.sort(key=lambda a: (-SEVERITY_RANK.get(a["severity"], 0), a["distance_km"] or 0))
    return alerts
