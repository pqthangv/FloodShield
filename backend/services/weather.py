"""Weather forecast from Open-Meteo (https://open-meteo.com, free, no API key)."""

from datetime import datetime, timezone
from services.cache import cache
from services.geo import snap
from services.http import get_client

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather interpretation codes -> (Vietnamese text, icon key understood by the app)
WMO_CODES: dict[int, tuple[str, str]] = {
    0: ("Trời quang", "clear"),
    1: ("Ít mây", "clear"),
    2: ("Có mây", "cloudy"),
    3: ("Nhiều mây", "cloudy"),
    45: ("Sương mù", "cloudy"),
    48: ("Sương mù đóng băng", "cloudy"),
    51: ("Mưa phùn nhẹ", "drizzle"),
    53: ("Mưa phùn", "drizzle"),
    55: ("Mưa phùn dày", "drizzle"),
    56: ("Mưa phùn lạnh", "drizzle"),
    57: ("Mưa phùn lạnh dày", "drizzle"),
    61: ("Mưa nhỏ", "drizzle"),
    63: ("Mưa vừa", "rain"),
    65: ("Mưa to", "rain"),
    66: ("Mưa lạnh", "rain"),
    67: ("Mưa lạnh to", "rain"),
    71: ("Tuyết nhẹ", "snow"),
    73: ("Tuyết", "snow"),
    75: ("Tuyết dày", "snow"),
    77: ("Mưa tuyết", "snow"),
    80: ("Mưa rào nhẹ", "drizzle"),
    81: ("Mưa rào", "rain"),
    82: ("Mưa rào rất to", "rain"),
    85: ("Mưa tuyết nhẹ", "snow"),
    86: ("Mưa tuyết to", "snow"),
    95: ("Dông", "thunderstorm"),
    96: ("Dông kèm mưa đá", "thunderstorm"),
    99: ("Dông kèm mưa đá lớn", "thunderstorm"),
}

CURRENT_VARS = (
    "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,"
    "weather_code,wind_speed_10m,wind_gusts_10m"
)
HOURLY_VARS = (
    "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,"
    "wind_gusts_10m"
)
DAILY_VARS = (
    "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,"
    "precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,"
    "sunrise,sunset"
)


def describe(code) -> tuple[str, str]:
    if code is None:
        return ("Không rõ", "cloudy")
    return WMO_CODES.get(int(code), ("Không rõ", "cloudy"))


def _round(value, digits=0):
    if value is None:
        return None
    return round(value, digits) if digits else int(round(value))


async def fetch_raw_forecast(lat: float, lon: float) -> dict:
    """Raw Open-Meteo response, shared by the weather endpoint and the alert engine."""
    lat_s, lon_s = snap(lat, 0.05), snap(lon, 0.05)

    async def load():
        resp = await get_client().get(
            FORECAST_URL,
            params={
                "latitude": lat_s,
                "longitude": lon_s,
                "current": CURRENT_VARS,
                "hourly": HOURLY_VARS,
                "daily": DAILY_VARS,
                "timezone": "auto",
                "forecast_days": 7,
                "wind_speed_unit": "kmh",
            },
        )
        resp.raise_for_status()
        return resp.json()

    return await cache.get_or_set(f"forecast:{lat_s}:{lon_s}", 15 * 60, load)


def normalize_forecast(raw: dict, hours: int = 48) -> dict:
    cur = raw.get("current", {})
    text, icon = describe(cur.get("weather_code"))
    current = {
        "time": cur.get("time"),
        "temperature": _round(cur.get("temperature_2m"), 1),
        "apparent_temperature": _round(cur.get("apparent_temperature"), 1),
        "humidity": _round(cur.get("relative_humidity_2m")),
        "precipitation": _round(cur.get("precipitation"), 1),
        "wind_speed": _round(cur.get("wind_speed_10m")),
        "wind_gusts": _round(cur.get("wind_gusts_10m")),
        "weather_code": cur.get("weather_code"),
        "condition": text,
        "icon": icon,
        "is_day": bool(cur.get("is_day", 1)),
    }

    hourly = []
    h = raw.get("hourly", {})
    times = h.get("time", [])
    # Start the hourly list at the current hour.
    now_hour = (cur.get("time") or "")[:13]
    start = next((i for i, t in enumerate(times) if t[:13] >= now_hour), 0) if now_hour else 0
    for i in range(start, min(start + hours, len(times))):
        text, icon = describe(h["weather_code"][i])
        hourly.append(
            {
                "time": times[i],
                "temperature": _round(h["temperature_2m"][i], 1),
                "precipitation": _round(h["precipitation"][i], 1),
                "precipitation_probability": h["precipitation_probability"][i],
                "wind_speed": _round(h["wind_speed_10m"][i]),
                "weather_code": h["weather_code"][i],
                "condition": text,
                "icon": icon,
            }
        )

    daily = []
    d = raw.get("daily", {})
    for i, date in enumerate(d.get("time", [])):
        text, icon = describe(d["weather_code"][i])
        daily.append(
            {
                "date": date,
                "temperature_max": _round(d["temperature_2m_max"][i], 1),
                "temperature_min": _round(d["temperature_2m_min"][i], 1),
                "precipitation_sum": _round(d["precipitation_sum"][i], 1),
                "precipitation_probability_max": d["precipitation_probability_max"][i],
                "wind_speed_max": _round(d["wind_speed_10m_max"][i]),
                "wind_gusts_max": _round(d["wind_gusts_10m_max"][i]),
                "weather_code": d["weather_code"][i],
                "condition": text,
                "icon": icon,
                "sunrise": d["sunrise"][i],
                "sunset": d["sunset"][i],
            }
        )

    return {
        "timezone": raw.get("timezone"),
        "utc_offset_seconds": raw.get("utc_offset_seconds", 0),
        "elevation": raw.get("elevation"),
        "current": current,
        "hourly": hourly,
        "daily": daily,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
